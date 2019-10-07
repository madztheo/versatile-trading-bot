import { Order } from "./order";
import * as Gdax from "gdax";
import { Signal } from "../strategies/signal";
import { SimpleEMAStrategy } from "../strategies/simple-ema-strategy";
import { IchimokuStrategy } from "../strategies/ichimoku-strategy";
import { Strategy } from "../strategies/strategy";
import * as nodemailer from "nodemailer";
import { CandleGenerator } from "../candle-generator";
import { Ticker } from "./ticker";
import { SimpleSMAStrategy } from "../strategies/simple-sma-strategy";
import { GenericCandle } from "../generic-candle";

export class CoinbaseTrader {
  key = process.env.COINBASE_KEY;
  secret = process.env.COINBASE_SECRET;
  apiURI = "https://api.pro.coinbase.com";
  sandboxURI = "https://api-public.sandbox.pro.coinbase.com";
  passphrase = process.env.COINBASE_PASSPHRASE;
  socketUrl = "wss://ws-feed.pro.coinbase.com";
  pair = process.env.PAIR || "LTC-EUR";
  maxFunds = process.env.FUNDS || "10"; // 10 EUR with 0.3% fee -> 0.03 EUR
  showSignalOnly = process.env.SIGNAL_ONLY === "true" ? true : false;
  period = parseInt(process.env.PERIOD) || 15;
  canTrade = process.env.CAN_TRADE === "true" ? true : false;
  currentStrategy = process.env.STRATEGY || "Ichimoku";
  mailAlert = process.env.MAIL_ALERT || "All order";
  priceData: GenericCandle[];
  lastUpdate = new Date();
  lastFilledBuyOrder: Order;
  hasOpenBuyPosition = false;
  needToGetLastOrder = false;
  stopLossPercentage = parseFloat(process.env.STOP_LOSS) || 3;
  testMode = false;
  reconnectInterval: any;
  strategy: Strategy;

  constructor(testMode = false) {
    this.testMode = testMode;
    console.log(`Crypto pair traded : ${this.pair}`);
    console.log(`Crypto max funds per trade : ${this.maxFunds}`);
    console.log(`Crypto period used : ${this.period} minutes`);
    console.log(`Crypto trade ${this.canTrade ? "on" : "off"}`);
    console.log(`Crypto stop loss : ${this.stopLossPercentage}%`);
    console.log(`Crypto strategy : ${this.currentStrategy}`);
    console.log(`Crypto alert level : ${this.mailAlert}`);
  }

  private sendMail(subject, content) {
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIl_HOST,
      port: process.env.EMAIl_PORT || 465,
      secure: true,
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
      }
    });

    const mailOptions = {
      from: "Trading bot",
      to: process.env.EMAIL_RECIPIENT,
      subject,
      text: content,
      html: content
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
      } else {
        console.log("Email sent: " + info.response);
      }
    });
  }

  private getCurrentPosition(authedClient: Gdax.AuthenticatedClient) {
    this.getFilledOrders(authedClient, "all").then(latestOrders => {
      if (latestOrders && latestOrders.length > 0) {
        this.hasOpenBuyPosition = latestOrders[0].side === "buy";
        if (this.hasOpenBuyPosition) {
          this.lastFilledBuyOrder = latestOrders[0];
          this.needToGetLastOrder = false;
        }
      }
    });
  }

  private computeStopLossPrice(percent: number, positionPrice: number) {
    if (this.currentStrategy === "Ichimoku") {
      return (this.strategy as IchimokuStrategy).getStopLossPrice();
    } else {
      return positionPrice - positionPrice * (percent / 100);
    }
  }

  private getFilledOrders(
    authedClient: Gdax.AuthenticatedClient,
    side: string
  ) {
    return authedClient
      .getFills({
        product_id: this.pair
      })
      .then((data: Order[]) => {
        if (data && data.length > 0) {
          let orderedData = data.sort(
            (x, y) =>
              new Date(y.created_at).valueOf() -
              new Date(x.created_at).valueOf()
          );
          if (side !== "all") {
            orderedData = orderedData.filter(x => x.side === side);
          }
          return orderedData;
        }
      });
  }

  private convertPriceData(data: number[][]) {
    // [[ time, low, high, open, close, volume ] * n] (e.g LHOC)
    return data.map(x => {
      return {
        time: new Date(x[0] * 1000),
        low: x[1],
        high: x[2],
        open: x[3],
        close: x[4],
        volume: x[5]
      };
    });
  }

  private getHistoricRates(authedClient: Gdax.AuthenticatedClient) {
    return authedClient
      .getProductHistoricRates(this.pair, {
        granularity: 60 * this.period
      })
      .then(result => {
        return this.convertPriceData(result);
      });
  }

  private getAvailableBalances(authedClient: Gdax.AuthenticatedClient) {
    return authedClient.getAccounts().then(accounts => {
      const availableBalances = {
        BTC: "0",
        EUR: "0",
        LTC: "0",
        BCH: "0",
        ETH: "0",
        ETC: "0"
      };
      accounts.forEach(x => {
        availableBalances[x.currency] = x.available;
      });
      return availableBalances;
    });
  }

  private isSellPositionOpen(authedClient: Gdax.AuthenticatedClient) {
    return this.getFilledOrders(authedClient, "sell").then(orders => {
      return orders && orders.length > 0 && orders[0].settled;
    });
  }

  private isBuyPositionOpen(authedClient: Gdax.AuthenticatedClient) {
    return this.getFilledOrders(authedClient, "buy").then(orders => {
      return orders && orders.length > 0 && orders[0].settled;
    });
  }

  private getAmountOfCryptoToSell(authedClient: Gdax.AuthenticatedClient) {
    return authedClient
      .getFills({
        product_id: this.pair
      })
      .then(data => {
        if (data && data.length > 0) {
          return data[0].size;
        } else {
          return "0";
        }
      });
  }

  private roundTo2Decimals(num: number) {
    return Math.floor(num * 100) / 100;
  }

  private buy(authedClient: Gdax.AuthenticatedClient, signal: Signal) {
    return this.getAvailableBalances(authedClient).then(balances => {
      const funds = this.roundTo2Decimals(parseFloat(this.maxFunds));
      const availableBalance = this.roundTo2Decimals(
        parseFloat(balances[this.pair.substr(4, 3)])
      );
      let fundsToUse = availableBalance > funds ? funds : availableBalance;
      /**
       * If we got a normal buy we just put half of the funds, if we got a strong buy
       * we put everything.
       * In practice, a buy signal should be issued before a strong buy signal
       * as a crossing of the short and long MA should happen before the crossing of the
       * long MA and the base MA.
       * Meaning that half of the funds will already be allocated. So the rest of it
       * will be used after a strong buy signal, completing the position even further.
       * The fees being a percentage, the size of the position will have no incidence
       * over those as a whole.
       * */
      if (signal === Signal.Buy) {
        fundsToUse = fundsToUse >= 20 ? fundsToUse / 2 : 10;
      }
      console.log(availableBalance);
      console.log(funds);
      console.log("funds to use");
      console.log(fundsToUse);
      //Coinbase minimum is 10
      if (fundsToUse >= 10) {
        return authedClient.buy({
          funds: fundsToUse.toString(), // 10 EUR with 0.3% of fee -> 3 cents
          product_id: this.pair,
          type: "market",
          size: null,
          side: "buy"
        });
      }
    });
  }

  private sell(authedClient: Gdax.AuthenticatedClient) {
    return this.getAvailableBalances(authedClient).then(balances => {
      if (balances[this.pair.substr(0, 3)] !== "0") {
        return authedClient.sell({
          funds: null,
          product_id: this.pair,
          type: "market",
          size: balances[this.pair.substr(0, 3)],
          side: "sell"
        });
      }
    });
  }

  private analyseSignal(
    signal: Signal,
    authedClient: Gdax.AuthenticatedClient
  ) {
    if (this.canTrade) {
      console.log("can trade");
      if (signal === Signal.Buy || signal === Signal.StrongBuy) {
        console.log("buying");
        this.buy(authedClient, signal)
          .then(res => {
            console.log("Buying complete");
            if (res) {
              this.needToGetLastOrder = true;
            }
            if (
              res &&
              (this.mailAlert === "All order" || this.mailAlert === "Buy only")
            ) {
              console.log("Order");
              console.log(res);
              this.sendMail(
                `Buy order on ${this.pair}`,
                `At ${new Date().toISOString()} : ${JSON.stringify(res)}`
              );
            }
          })
          .catch(err => {
            console.log("Error");
            console.log(err);
          });
      } else if (
        signal === Signal.Sell ||
        signal === Signal.StrongSell ||
        signal === Signal.LongExit
      ) {
        this.sell(authedClient)
          .then(res => {
            if (
              res &&
              (this.mailAlert === "All order" || this.mailAlert === "Sell only")
            ) {
              console.log("Order");
              console.log(res);
              this.sendMail(
                `Sell order on ${this.pair}`,
                `At ${new Date().toISOString()} : ${JSON.stringify(res)}`
              );
            }
          })
          .catch(err => {
            console.log("Error");
            console.log(err);
          });
      }
    }
  }

  private callStrategy(
    authedClient: Gdax.AuthenticatedClient,
    strategy: Strategy
  ) {
    const strategyRes = strategy.getStrategy(this.priceData);
    if (strategyRes.signal !== Signal.Nothing || !this.showSignalOnly) {
      if (
        strategyRes.signal !== Signal.ShortExit &&
        strategyRes.signal !== Signal.LongExit
      ) {
        console.log("==== Signal ====");
        console.log(strategyRes.data);
        console.log(new Date().toISOString());
        console.log(strategyRes.signal);
      }
      if (!this.testMode) {
        this.analyseSignal(strategyRes.signal, authedClient);
      }
    }
  }

  private handleHistoricRate(
    data: GenericCandle[],
    authedClient: Gdax.AuthenticatedClient,
    strategy: Strategy
  ) {
    if (!this.priceData) {
      this.priceData = data;
    } else {
      //So as to add every missing candle and not just the last one
      let newItemAdded = false;
      for (let i = data.length - 1; i >= 0; i--) {
        if (data[i].time > this.lastUpdate) {
          this.priceData.unshift(data[i]);
          newItemAdded = true;
        }
      }
      if (newItemAdded) {
        this.lastUpdate = new Date();
      }
      if (this.priceData.length > 10000) {
        this.priceData.pop();
      }
    }
    this.callStrategy(authedClient, strategy);
  }

  private onSocketDisconnected(websocket: Gdax.WebsocketClient) {
    console.log(
      "ERROR",
      "Websocket Error",
      `websocket closed unexpectedly. Attempting to re-connect.`
    );

    //We need to empty it to avoid any discrepancies after the reconnection
    this.priceData = null;

    // try to re-connect the first time...
    websocket.connect();

    let count = 1;
    // attempt to re-connect every 30 seconds.
    this.reconnectInterval = setInterval(() => {
      if (!websocket) {
        count++;
        // send me a email if it keeps failing every 30/2 = 15 minutes
        if (count % 30 === 0) {
          const time_since = 30 * count;
          this.sendMail(
            "Trading bot disconnected",
            `Attempting to re-connect for the ${count} time. It has been ${time_since} seconds since we lost connection.`
          );
        }
        websocket.connect();
      } else {
        clearInterval(this.reconnectInterval);
      }
    }, 30000);
  }

  private checkStopLoss(data: any, authedClient: Gdax.AuthenticatedClient) {
    if (this.hasOpenBuyPosition && data.type === "ticker") {
      const stopLoss = this.computeStopLossPrice(
        this.stopLossPercentage,
        parseFloat(this.lastFilledBuyOrder.price)
      );
      const ticker = <Ticker>(<any>data);
      if (ticker.price && parseFloat(ticker.price) < stopLoss) {
        this.sell(authedClient)
          .then(res => {
            if (
              res &&
              (this.mailAlert === "All order" || this.mailAlert === "Sell only")
            ) {
              console.log("Stop loss order");
              console.log(res);
              this.sendMail(
                `Stop loss order on ${this.pair}`,
                `At ${new Date().toISOString()} : ${JSON.stringify(res)}`
              );
            }
          })
          .catch(err => {
            console.log("Error");
            console.log(err);
          });
      }
    }
  }

  start() {
    const websocket = new Gdax.WebsocketClient(
      [this.pair],
      this.socketUrl,
      {
        key: this.key,
        secret: this.secret,
        passphrase: this.passphrase
      },
      { channels: ["ticker", "heartbeat"] }
    );

    const authedClient = new Gdax.AuthenticatedClient(
      this.key,
      this.secret,
      this.passphrase,
      this.apiURI
    );

    if (this.currentStrategy === "Ichimoku") {
      this.strategy = new IchimokuStrategy();
    } else if (this.currentStrategy === "SMA") {
      this.strategy = new SimpleSMAStrategy(10, 20);
    } else {
      this.strategy = new SimpleEMAStrategy(10, 20);
    }

    this.getCurrentPosition(authedClient);

    websocket.on("open", () => {
      if (this.reconnectInterval) {
        clearInterval(this.reconnectInterval);
      }
      console.log("Socket connection opened");
      console.log(this.priceData);
      this.getHistoricRates(authedClient).then(data => {
        //console.log(data);
        this.handleHistoricRate(data, authedClient, this.strategy);
        let candleGenerator = new CandleGenerator(this.priceData, this.period);

        //To avoid multiple definition of it in case of disconnection
        if (websocket.listenerCount("message") > 0) {
          websocket.removeAllListeners("message");
        }
        websocket.on("message", data => {
          if (!this.priceData) {
            return;
          }
          let result = candleGenerator.getCoinbaseCandle(
            <any>data,
            this.priceData
          );
          this.priceData = result.priceData;
          //We check for signal on every ticker
          if (result.update) {
            this.callStrategy(authedClient, this.strategy);
            //We get the current position if there is one
            if (this.needToGetLastOrder) {
              this.getCurrentPosition(authedClient);
            }
            //We check that we are above the stop loss
            this.checkStopLoss(data, authedClient);
          }
        });
      });
    });
    websocket.on("error", err => {
      console.log("ERROR");
      console.log(err);
    });
    websocket.on("close", () => {
      this.onSocketDisconnected(websocket);
    });
  }
}
