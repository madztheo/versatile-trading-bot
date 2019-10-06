const request = require("request");
import { Observable, Observer } from "rxjs";
import { AccountDetails } from "./interfaces/account-details";
import { CandleStickGranularity } from "./interfaces/candle/candle-stick-granularity";
import { Heartbeat } from "./interfaces/price/heartbeat";
import { Price } from "./interfaces/price/price";
import { CandleStick } from "./interfaces/candle/candle-stick";
import { GenericCandle } from "../generic-candle";
import { Strategy } from "../strategies/strategy";
import { Signal } from "../strategies/signal";
import { IchimokuStrategy } from "../strategies/ichimoku-strategy";
import { SimpleSMAStrategy } from "../strategies/simple-sma-strategy";
import { SimpleEMAStrategy } from "../strategies/simple-ema-strategy";
import { Position } from "./interfaces/position";
import { Instrument } from "./interfaces/instrument";
import { AccountSummary } from "./interfaces/account-summary";
import { HomeConversions } from "./interfaces/home-conversions";
import { ATRPattern } from "../strategies/atr-pattern";

export class OandaTrader {
  apiKey = "";
  testAPI = "https://api-fxpractice.oanda.com";
  realAPI = "	https://api-fxtrade.oanda.com";
  streamingTestApi = "https://stream-fxpractice.oanda.com";
  streamingApi = "https://stream-fxtrade.oanda.com";
  accountID = "";
  pairTraded = "EUR_USD";
  priceData: GenericCandle[];
  testMode = false;
  canTrade = process.env.CAN_TRADE === "true" ? true : false;
  currentStrategy = "Ichimoku";
  period = 5;
  hasClosePositionBeforeWeekend = false;
  instrumentDetails: Instrument;
  realTrade = false;
  nbOfPairsTraded = 1;
  accountSummary: AccountSummary;
  backTrackingPosition: {
    units: number;
    entryPrice: number;
    type: "long" | "short";
  };
  strategy: Strategy;

  constructor(
    strategy = "Ichimoku",
    period = 5,
    asset = "EUR_USD",
    testMode = false,
    realTrade = false,
    pairsTraded = 1
  ) {
    this.currentStrategy = strategy;
    this.period = period;
    this.pairTraded = asset;
    this.testMode = testMode;
    this.realTrade = realTrade;
    this.nbOfPairsTraded = pairsTraded;
    this.accountID = this.realTrade
      ? process.env.OANDA_REAL_ACCOUNT_ID
      : process.env.OANDA_TEST_ACCOUNT_ID;
    this.apiKey = this.realTrade
      ? process.env.OANDA_REAL_API_KEY
      : process.env.OANDA_TEST_API_KEY;
    console.log("==== Forex pair ====");
    console.log(`Forex pair traded : ${this.pairTraded}`);
    console.log(`Forex period used : ${this.period} minutes`);
    console.log(`Forex trade ${this.canTrade ? "on" : "off"}`);
    console.log(`Forex strategy : ${this.currentStrategy}`);
    console.log(`Real trading : ${this.realTrade}`);
  }

  private streamRequest(path: string): Observable<any> {
    const url = `${
      this.realTrade ? this.streamingApi : this.streamingTestApi
    }${path}`;
    return Observable.create((observer: Observer<any>) => {
      request
        .get(url, {
          auth: {
            bearer: this.apiKey
          }
        })
        .on("data", data => {
          const result = data.toString();
          try {
            observer.next(JSON.parse(result));
          } catch {}
        })
        .on("error", err => {
          console.log("Error with Oanda stream");
          console.log(err);
        });
    });
  }

  private singleRequest(
    path: string,
    method = "GET",
    body?: any
  ): Promise<any> {
    const url = `${this.realTrade ? this.realAPI : this.testAPI}${path}`;
    return new Promise((resolve, reject) => {
      request(
        url,
        {
          method,
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json"
          },
          auth: {
            bearer: this.apiKey
          }
        },
        (err, res, data) => {
          if (err) {
            reject(err);
          } else if (data) {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject("Error while parsing JSON");
            }
          }
        }
      );
    });
  }

  private convertToGenericCandles(
    oandaCandles: CandleStick[]
  ): GenericCandle[] {
    return oandaCandles.map(x => {
      return {
        time: new Date(x.time),
        low: parseFloat(x.mid.l),
        high: parseFloat(x.mid.h),
        open: parseFloat(x.mid.o),
        close: parseFloat(x.mid.c),
        volume: x.volume
      };
    });
  }

  private getAccountDetails(): Promise<AccountDetails> {
    return this.singleRequest(`/v3/accounts/${this.accountID}`).then(res => {
      if (res) {
        return res.account;
      }
    });
  }

  private getAccountSummary(): Promise<AccountSummary> {
    return this.singleRequest(`/v3/accounts/${this.accountID}/summary`).then(
      res => {
        if (res) {
          return res.account;
        }
      }
    );
  }

  private getPriceStream(): Observable<Heartbeat | Price> {
    return this.streamRequest(
      `/v3/accounts/${this.accountID}/pricing/stream?instruments=${this.pairTraded}`
    );
  }

  private getPrice(): Promise<Price> {
    return this.singleRequest(
      `/v3/accounts/${this.accountID}/pricing?instruments=${this.pairTraded}`
    ).then(res => {
      if (res && res.prices && res.prices.length > 0) {
        return res.prices[0];
      }
    });
  }

  private getConversionRates(): Promise<HomeConversions[]> {
    return this.singleRequest(
      `/v3/accounts/${this.accountID}/pricing?instruments=${this.pairTraded}&includeHomeConversions=true`
    ).then(res => {
      if (res && res.prices && res.prices.length > 0) {
        return res.homeConversions;
      }
    });
  }

  private getInstrumentDetails(): Promise<Instrument> {
    return this.singleRequest(
      `/v3/accounts/${this.accountID}/instruments?instruments=${this.pairTraded}`
    ).then(res => res.instruments[0]);
  }

  private getCandles(
    count: number,
    granularity: CandleStickGranularity
  ): Promise<CandleStick[]> {
    if (count === 0) {
      return this.singleRequest(
        `/v3/instruments/${
          this.pairTraded
        }/candles?price=MBA&granularity=${granularity}&from=${this.priceData[0].time.toISOString()}`
      ).then(res => {
        if (!res || !res.candles) {
          console.log("Undefined candles");
          console.log(res);
        }
        return res.candles;
      });
    } else {
      return this.singleRequest(
        `/v3/instruments/${this.pairTraded}/candles?count=${count}&price=MBA&granularity=${granularity}`
      ).then(res => {
        if (!res || !res.candles) {
          console.log("Undefined candles");
          console.log(res);
        }
        return res.candles;
      });
    }
  }

  private getOpenPosition(): Promise<Position> {
    return this.singleRequest(
      `/v3/accounts/${this.accountID}/positions/${this.pairTraded}`
    ).then(res => {
      if (res) {
        return res.position;
      }
    });
  }

  private closeLongPosition(bid?: number) {
    if (!this.testMode) {
      return this.singleRequest(
        `/v3/accounts/${this.accountID}/positions/${this.pairTraded}/close`,
        "PUT",
        {
          longUnits: "ALL"
        }
      );
    } else if (this.backTrackingPosition) {
      let accountBalance = parseFloat(this.accountSummary.balance);
      const accountMarginRate = parseFloat(this.accountSummary.marginRate);
      const instrumentMarginRate = parseFloat(
        this.instrumentDetails.marginRate
      );
      const marginRate =
        instrumentMarginRate > accountMarginRate
          ? instrumentMarginRate
          : accountMarginRate;
      const profits = (bid - this.backTrackingPosition.entryPrice) / marginRate;
      accountBalance += profits;
      this.accountSummary.balance = accountBalance.toString();
      console.log(`New balance on ${this.pairTraded}`);
      console.log(this.accountSummary.balance);
      this.backTrackingPosition = null;
    }
    return Promise.resolve();
  }

  private closeShortPosition(ask?: number) {
    if (!this.testMode) {
      return this.singleRequest(
        `/v3/accounts/${this.accountID}/positions/${this.pairTraded}/close`,
        "PUT",
        {
          shortUnits: "ALL"
        }
      );
    } else if (this.backTrackingPosition) {
      let accountBalance = parseFloat(this.accountSummary.balance);
      const accountMarginRate = parseFloat(this.accountSummary.marginRate);
      const instrumentMarginRate = parseFloat(
        this.instrumentDetails.marginRate
      );
      const marginRate =
        instrumentMarginRate > accountMarginRate
          ? instrumentMarginRate
          : accountMarginRate;
      const profits = (this.backTrackingPosition.entryPrice - ask) / marginRate;
      accountBalance += profits;
      this.accountSummary.balance = accountBalance.toString();
      console.log(`New balance on ${this.pairTraded}`);
      console.log(this.accountSummary.balance);
      this.backTrackingPosition = null;
    }
    return Promise.resolve();
  }

  private getSpread(bid: number, ask: number) {
    const spread = Math.abs(ask - bid);
    return spread * Math.pow(10, Math.abs(this.instrumentDetails.pipLocation));
  }

  private isSpreadSmallEnough(bid: number, ask: number) {
    console.log(`Spread on ${this.pairTraded}`);
    console.log(this.getSpread(bid, ask));
    //We allow a wider spread when using a longer period
    let maxSpread = 3;
    if (this.period < 60) {
      maxSpread = 3;
    } else if (this.period < 240) {
      maxSpread = 5;
    } else {
      maxSpread = 10;
    }
    return this.getSpread(bid, ask) <= maxSpread;
  }

  private roundToNDecimals(num: number, decimals: number) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  private getStopLossDistance() {
    if (this.currentStrategy === "Ichimoku") {
      const ichimokuStopLoss = (this
        .strategy as IchimokuStrategy).getStopLossDistance(this.priceData[0]);
      const minStopLoss = parseFloat(
        this.instrumentDetails.minimumTrailingStopDistance
      );
      const stopLossToUse =
        ichimokuStopLoss > minStopLoss ? ichimokuStopLoss : minStopLoss;
      let stopLossDistance = this.roundToNDecimals(
        stopLossToUse,
        Math.abs(this.instrumentDetails.pipLocation)
      );
      return stopLossDistance.toString();
    } else {
      const atrPattern = new ATRPattern();
      const atrStopLoss = atrPattern.getStopLossDistance(this.priceData);
      const minStopLoss = parseFloat(
        this.instrumentDetails.minimumTrailingStopDistance
      );
      const stopLossToUse =
        atrStopLoss > minStopLoss ? atrStopLoss : minStopLoss;
      let stopLossDistance = this.roundToNDecimals(
        stopLossToUse,
        Math.abs(this.instrumentDetails.pipLocation)
      );
      return stopLossDistance.toString();
    }
  }

  private canPlaceEntryOrder() {
    const marginCallPercent = parseFloat(this.accountSummary.marginCallPercent);
    //If it's above or equal to one a margin call has been raised, we don't want to get there
    return marginCallPercent <= 0.9;
  }

  private hasReachFundsLimit(
    orderUnits: number,
    bigPosition: boolean,
    totalUnits: number
  ) {
    if (bigPosition) {
      //A big position so it's two thirds of the allowed funds
      //We want to allow a maximum of two third of the amount per pair
      return totalUnits + orderUnits > orderUnits + 2;
    } else {
      return totalUnits + orderUnits > orderUnits * 2 + 2;
    }
  }

  private getAllocableFunds(bigTrade = false) {
    const balance = parseFloat(this.accountSummary.balance);
    //We set the funds evenly accross all pairs traded
    const mainFraction = balance / this.nbOfPairsTraded;
    //If it's a big trade (aka Strong Buy or Sell) we put 2 thirds of the
    //allocable funds otherwise just 1 third
    return bigTrade ? (mainFraction / 3) * 2 : mainFraction / 3;
  }

  private getAllocableUnits(bigTrade = false) {
    const allocableFundsInEuro = this.getAllocableFunds(bigTrade);
    const accountMarginRate = parseFloat(this.accountSummary.marginRate);
    const instrumentMarginRate = parseFloat(this.instrumentDetails.marginRate);
    const marginRate =
      instrumentMarginRate > accountMarginRate
        ? instrumentMarginRate
        : accountMarginRate;
    //It's Euro, no conversion needed
    if (this.instrumentDetails.displayName.startsWith("EUR")) {
      return Promise.resolve(Math.floor(allocableFundsInEuro / marginRate));
    } else {
      return this.getConversionRates().then(homeConversions => {
        const conversion = homeConversions.find(x =>
          this.instrumentDetails.displayName.startsWith(x.currency)
        );
        if (conversion) {
          const rate = parseFloat(conversion.positionValue);
          return Math.floor(allocableFundsInEuro / marginRate / rate);
        }
        return 0;
      });
    }
  }

  private openLong(bigPosition: boolean, bid: number, ask: number) {
    if (!this.testMode) {
      return this.getOpenPosition().then(position => {
        if (position && position.long.units !== "0") {
          //One position at a time
          return Promise.reject("A similar position is already opened");
        }
        const buy = () => {
          const totalUnits = position ? parseInt(position.long.units) : 0;
          if (!this.isSpreadSmallEnough(bid, ask)) {
            return Promise.reject("The spread is too wide for now");
          }
          if (!this.canPlaceEntryOrder()) {
            return Promise.reject("Too close from margin call");
          }
          return this.getAllocableUnits(bigPosition).then(units => {
            //Not too much
            if (
              position &&
              this.hasReachFundsLimit(units, bigPosition, totalUnits)
            ) {
              return Promise.reject("Too much fund invested");
            }
            return this.singleRequest(
              `/v3/accounts/${this.accountID}/orders`,
              "POST",
              {
                order: {
                  type: "MARKET",
                  instrument: this.pairTraded,
                  units: units.toString(),
                  stopLossOnFill: {
                    timeInForce: "GTC",
                    distance: this.getStopLossDistance()
                  }
                  /*trailingStopLossOnFill: {
                    timeInForce: "GTC",
                    distance: this.getStopLossDistance()
                  }*/
                }
              }
            );
          });
        };
        if (position && position.short.units !== "0") {
          return this.closeShortPosition().then(() => buy());
        } else {
          return buy();
        }
      });
    } else {
      if (
        this.backTrackingPosition &&
        this.backTrackingPosition.type === "long"
      ) {
        //One position at a time
        return Promise.reject("A similar position is already opened");
      }
      const buy = () => {
        if (!this.isSpreadSmallEnough(bid, ask)) {
          return Promise.reject("The spread is too wide for now");
        }
        return this.getAllocableUnits(bigPosition).then(units => {
          if (this.backTrackingPosition) {
            return Promise.resolve();
          }
          this.backTrackingPosition = {
            units: units,
            entryPrice: ask,
            type: "long"
          };
          return Promise.resolve();
        });
      };
      if (this.backTrackingPosition) {
        return this.closeShortPosition(ask).then(() => buy());
      } else {
        return buy();
      }
    }
  }

  private openShort(bigPosition: boolean, bid: number, ask: number) {
    if (!this.testMode) {
      return this.getOpenPosition().then(position => {
        if (position && position.short.units !== "0") {
          //One position at a time
          return Promise.reject("A similar position is already opened");
        }
        const sell = () => {
          const totalUnits = position
            ? Math.abs(parseInt(position.short.units))
            : 0;
          if (!this.isSpreadSmallEnough(bid, ask)) {
            return Promise.reject("The spread is too wide for now");
          }
          if (!this.canPlaceEntryOrder()) {
            return Promise.reject("Too close from margin call");
          }
          return this.getAllocableUnits(bigPosition).then(units => {
            //Not too much
            if (
              position &&
              this.hasReachFundsLimit(units, bigPosition, totalUnits)
            ) {
              return Promise.reject("Too much fund invested");
            }
            return this.singleRequest(
              `/v3/accounts/${this.accountID}/orders`,
              "POST",
              {
                order: {
                  type: "MARKET",
                  instrument: this.pairTraded,
                  units: `-${units.toString()}`,
                  stopLossOnFill: {
                    timeInForce: "GTC",
                    distance: this.getStopLossDistance()
                  }
                  /*trailingStopLossOnFill: {
                    timeInForce: "GTC",
                    distance: this.getStopLossDistance()
                  }*/
                }
              }
            );
          });
        };
        if (position && position.long.units !== "0") {
          return this.closeLongPosition(bid).then(() => sell());
        } else {
          return sell();
        }
      });
    } else {
      if (
        this.backTrackingPosition &&
        this.backTrackingPosition.type === "short"
      ) {
        //One position at a time
        return Promise.reject("A similar position is already opened");
      }
      const sell = () => {
        if (!this.isSpreadSmallEnough(bid, ask)) {
          return Promise.reject("The spread is too wide for now");
        }
        return this.getAllocableUnits(bigPosition).then(units => {
          if (this.backTrackingPosition) {
            return Promise.resolve();
          }
          this.backTrackingPosition = {
            units: units,
            entryPrice: bid,
            type: "short"
          };
          return Promise.resolve();
        });
      };
      if (this.backTrackingPosition) {
        return this.closeLongPosition(bid).then(() => sell());
      } else {
        return sell();
      }
    }
  }

  private analyseSignal(signal: Signal, bid: number, ask: number) {
    if (this.canTrade || this.testMode) {
      if (signal === Signal.Buy || signal === Signal.StrongBuy) {
        this.openLong(signal === Signal.StrongBuy, bid, ask)
          .then(res => {
            if (this.realTrade) {
              console.log("==== Real trade ====");
            } else {
              console.log("==== Practice trade ====");
            }
            console.log(`Forex long order on ${this.pairTraded}`);
            console.log(res);
          })
          .catch(err => {
            console.log(`Error on ${this.pairTraded}`);
            console.log(err);
          });
      } else if (signal === Signal.Sell || signal === Signal.StrongSell) {
        this.openShort(signal === Signal.StrongSell, bid, ask)
          .then(res => {
            if (this.realTrade) {
              console.log("==== Real trade ====");
            } else {
              console.log("==== Practice trade ====");
            }
            console.log(`Forex short order on ${this.pairTraded}`);
            console.log(res);
          })
          .catch(err => {
            console.log(`Error on ${this.pairTraded}`);
            console.log(err);
          });
      } else if (signal === Signal.LongExit) {
        if (!this.testMode) {
          this.getOpenPosition()
            .then(position => {
              if (position && position.long.units !== "0") {
                this.closeLongPosition()
                  .then(res => {
                    if (this.realTrade) {
                      console.log("==== Real trade ====");
                    } else {
                      console.log("==== Practice trade ====");
                    }
                    console.log(`Exit long position on ${this.pairTraded}`);
                    console.log(res);
                  })
                  .catch(err => {
                    console.log(`Error on ${this.pairTraded}`);
                    console.log(err);
                  });
              }
            })
            .catch(err => {
              console.log(`Error while getting position on ${this.pairTraded}`);
              console.log(err);
            });
        } else {
          if (
            this.backTrackingPosition &&
            this.backTrackingPosition.type === "long"
          ) {
            this.closeLongPosition(bid)
              .then(res => {
                if (this.realTrade) {
                  console.log("==== Real trade ====");
                } else {
                  console.log("==== Practice trade ====");
                }
                console.log(`Exit long position on ${this.pairTraded}`);
                console.log(res);
              })
              .catch(err => {
                console.log(`Error on ${this.pairTraded}`);
                console.log(err);
              });
          }
        }
      } else if (signal === Signal.ShortExit) {
        if (!this.testMode) {
          this.getOpenPosition()
            .then(position => {
              if (position && position.short.units !== "0") {
                this.closeShortPosition()
                  .then(res => {
                    if (this.realTrade) {
                      console.log("==== Real trade ====");
                    } else {
                      console.log("==== Practice trade ====");
                    }
                    console.log(`Exit short position on ${this.pairTraded}`);
                    console.log(res);
                  })
                  .catch(err => {
                    console.log(`Error on ${this.pairTraded}`);
                    console.log(err);
                  });
              }
            })
            .catch(err => {
              console.log(`Error while getting position on ${this.pairTraded}`);
              console.log(err);
            });
        } else {
          if (
            this.backTrackingPosition &&
            this.backTrackingPosition.type === "short"
          ) {
            this.closeShortPosition(ask)
              .then(res => {
                if (this.realTrade) {
                  console.log("==== Real trade ====");
                } else {
                  console.log("==== Practice trade ====");
                }
                console.log(`Exit short position on ${this.pairTraded}`);
                console.log(res);
              })
              .catch(err => {
                console.log(`Error on ${this.pairTraded}`);
                console.log(err);
              });
          }
        }
      }
    }
  }

  private callStrategy(strategy: Strategy, bid: number, ask: number) {
    const strategyRes = strategy.getStrategy(this.priceData);
    if (strategyRes.signal !== Signal.Nothing) {
      /*if (
        strategyRes.signal !== Signal.LongExit &&
        strategyRes.signal !== Signal.ShortExit
      ) {
        console.log("==== Forex Signal ====");
        console.log(strategyRes.data);
        console.log(strategyRes.signal);
        console.log(this.priceData[0]);
      }*/
      //We only need the account info for entry signals
      if (
        strategyRes.signal !== Signal.LongExit &&
        strategyRes.signal !== Signal.ShortExit &&
        !this.testMode
      ) {
        this.getAccountSummary().then(account => {
          this.accountSummary = account;
          this.analyseSignal(strategyRes.signal, bid, ask);
        });
      } else {
        this.analyseSignal(strategyRes.signal, bid, ask);
      }
    }
  }

  //Just for testing features
  test() {
    /*this.getAccountSummary().then(account => {
      this.accountSummary = account;
      console.log(this.accountSummary.alias);
      this.getInstrumentDetails().then(instrument => {
        this.instrumentDetails = instrument;
        this.getStopLossDistance();
      });
    });*/
  }

  startBacktracking() {
    let stringPeriod: any;
    if (this.period < 1) {
      stringPeriod = `S${this.period * 60}`;
    } else if (this.period < 60) {
      stringPeriod = `M${this.period}`;
    } else if (this.period < 60 * 24) {
      stringPeriod = `H${Math.trunc(this.period / 60)}`;
    } else if (this.period < 60 * 24 * 7) {
      stringPeriod = "D";
    } else if (this.period < 60 * 24 * 7 * 4) {
      stringPeriod = "W";
    } else {
      stringPeriod = "M";
    }
    console.log("String period");
    console.log(stringPeriod);
    this.getAccountSummary().then(account => {
      this.accountSummary = account;
      this.getInstrumentDetails().then(instrument => {
        this.instrumentDetails = instrument;
        this.getCandles(1500, stringPeriod)
          .then(candles => {
            if (!candles) {
              //We start again as long as we don't have a proper answer
              this.startBacktracking();
              return;
            }

            if (this.currentStrategy === "Ichimoku") {
              this.strategy = new IchimokuStrategy();
            } else if (this.currentStrategy === "SMA") {
              this.strategy = new SimpleSMAStrategy(10, 20);
            } else {
              this.strategy = new SimpleEMAStrategy(10, 20);
            }
            //We want the newest candle first
            const allOrderedCandles = candles.sort(
              (a, b) => new Date(b.time).valueOf() - new Date(a.time).valueOf()
            );
            const allGenericCandles = this.convertToGenericCandles(
              allOrderedCandles
            ).sort((a, b) => b.time.valueOf() - a.time.valueOf());
            this.priceData = allGenericCandles.slice(
              allGenericCandles.length - 500
            );

            console.log("Starting balance");
            console.log(this.accountSummary.balance);
            let candleNb = allGenericCandles.length - 501;

            const backtrackInterval = setInterval(() => {
              const newOrderedCandles = [allOrderedCandles[candleNb]];
              candleNb -= 1;
              //To replace the current candle by the same one with updated data
              if (
                newOrderedCandles.find(
                  x =>
                    new Date(x.time).valueOf() ===
                    this.priceData[0].time.valueOf()
                )
              ) {
                this.priceData = this.priceData.filter(
                  x => x.time.valueOf() !== this.priceData[0].time.valueOf()
                );
              }
              this.priceData.unshift(
                ...this.convertToGenericCandles(newOrderedCandles)
              );
              //We don't want it to become too large
              if (this.priceData.length > 10000) {
                this.priceData.pop();
              }
              this.callStrategy(
                this.strategy,
                parseFloat(newOrderedCandles[0].bid.c),
                parseFloat(newOrderedCandles[0].ask.c)
              );
              if (candleNb <= 0) {
                clearInterval(backtrackInterval);
                console.log("Back tracking over");
                console.log(`Final balance on ${this.pairTraded}`);
                console.log(this.accountSummary.balance);
              }
            }, 200);
          })
          .catch(err => {
            console.log(`Error retrieving candles on ${this.pairTraded}`);
            console.log(err);
          });
      });
    });
  }

  start() {
    let stringPeriod: any;
    if (this.period < 1) {
      stringPeriod = `S${this.period * 60}`;
    } else if (this.period < 60) {
      stringPeriod = `M${this.period}`;
    } else if (this.period < 60 * 24) {
      stringPeriod = `H${Math.trunc(this.period / 60)}`;
    } else if (this.period < 60 * 24 * 7) {
      stringPeriod = "D";
    } else if (this.period < 60 * 24 * 7 * 4) {
      stringPeriod = "W";
    } else {
      stringPeriod = "M";
    }
    console.log("String period");
    console.log(stringPeriod);
    this.getAccountSummary().then(account => {
      this.accountSummary = account;
      this.getInstrumentDetails().then(instrument => {
        this.instrumentDetails = instrument;
        //console.log(`${this.pairTraded} details`);
        //console.log(this.instrumentDetails);
        this.getCandles(500, stringPeriod)
          .then(candles => {
            if (!candles) {
              //We start again as long as we don't have a proper answer
              this.start();
              return;
            }

            if (this.currentStrategy === "Ichimoku") {
              this.strategy = new IchimokuStrategy();
            } else if (this.currentStrategy === "SMA") {
              this.strategy = new SimpleSMAStrategy(10, 20);
            } else {
              this.strategy = new SimpleEMAStrategy(10, 20);
            }
            //We want the newest candle first
            this.priceData = this.convertToGenericCandles(candles).sort(
              (a, b) => b.time.valueOf() - a.time.valueOf()
            );

            if (this.currentStrategy === "Ichimoku") {
              //We get an history of previous signals to start work on it
              //We start at the 100th candles to have enough margin
              //We want to get the older first and slowly move forward to the present
              const reversedPriceData = [...this.priceData].sort(
                (a, b) => a.time.valueOf() - b.time.valueOf()
              );
              for (let i = 100; i < reversedPriceData.length; i++) {
                //We need to reverse it again to give it as the algorithm expect it
                this.strategy.getStrategy(
                  reversedPriceData
                    .slice(0, i)
                    .sort((a, b) => b.time.valueOf() - a.time.valueOf())
                );
              }
              //console.log((<IchimokuStrategy>this.strategy).signalsHistory);
            }

            const today = new Date();
            if (
              (today.getUTCDay() === 5 && today.getUTCHours() >= 21) ||
              today.getUTCDay() === 6 ||
              (today.getUTCDay() === 0 && today.getUTCHours() < 21)
            ) {
              console.log("It's the weekend");
              //console.log(this.priceData.slice(0, 2));
            }

            //We do some polling because the streaming is not reliable
            setInterval(() => {
              const currentDate = new Date();
              if (
                !this.hasClosePositionBeforeWeekend &&
                currentDate.getUTCDay() === 5 &&
                currentDate.getUTCHours() === 20 &&
                currentDate.getUTCMinutes() === 55
              ) {
                //5 minutes before close we close all positions.
                //We don't want to keep them through the weekend
                console.log("Closing positions before the weekend");
                if (this.period < 60) {
                  //We keep the positions open for period above or equal to 1h
                  this.getOpenPosition().then(position => {
                    if (position && position.short.units !== "0") {
                      this.closeShortPosition();
                    }
                    if (position && position.long.units !== "0") {
                      this.closeLongPosition();
                    }
                  });
                }
                this.hasClosePositionBeforeWeekend = true;
              }

              if (
                (currentDate.getUTCDay() === 5 &&
                  currentDate.getUTCHours() >= 21) ||
                currentDate.getUTCDay() === 6 ||
                (currentDate.getUTCDay() === 0 &&
                  currentDate.getUTCHours() < 21)
              ) {
                //The forex is closed during the weekend from Friday at 9pm UTC to Sunday at 9pm UTC.
                //So we disable the polling requests
                if (this.hasClosePositionBeforeWeekend) {
                  console.log("Closed for the weekend. See you Monday...");
                  //It's now close, we set it to false for next weekend
                  this.hasClosePositionBeforeWeekend = false;
                }
                return;
              }

              this.getCandles(0, stringPeriod)
                .then(newCandles => {
                  if (!newCandles) {
                    return;
                  }
                  const newOrderedCandles = newCandles.sort(
                    (a, b) =>
                      new Date(b.time).valueOf() - new Date(a.time).valueOf()
                  );
                  //To replace the current candle by the same one with updated data
                  if (
                    newOrderedCandles.find(
                      x =>
                        new Date(x.time).valueOf() ===
                        this.priceData[0].time.valueOf()
                    )
                  ) {
                    this.priceData = this.priceData.filter(
                      x => x.time.valueOf() !== this.priceData[0].time.valueOf()
                    );
                  }
                  this.priceData.unshift(
                    ...this.convertToGenericCandles(newOrderedCandles)
                  );
                  //We don't want it to become too large
                  if (this.priceData.length > 10000) {
                    this.priceData.pop();
                  }
                  this.getPrice().then(price => {
                    //console.log("Price");
                    //console.log(price);
                    if (price) {
                      this.callStrategy(
                        this.strategy,
                        parseFloat(price.bids[0].price),
                        parseFloat(price.asks[0].price)
                      );
                    }
                  });
                })
                .catch(err => {
                  console.log(`Error retrieving candles on ${this.pairTraded}`);
                  console.log(err);
                });
            }, 5000);

            //In case we want to use the streaming pricing instead
            //Though it's not reliable as it doesn't reflect ticker but just price update
            /*const candleGenerator = new CandleGenerator(
              this.priceData,
              this.period
            );
            this.getPriceStream().subscribe(
              ticker => {
                const currentDate = new Date();
                if (
                  !this.hasClosePositionBeforeWeekend &&
                  currentDate.getUTCDay() === 5 &&
                  currentDate.getUTCHours() === 20 &&
                  currentDate.getUTCMinutes() === 55
                ) {
                  //5 minutes before close we close all positions.
                  //We don't want to keep them through the weekend
                  console.log("Closing positions before the weekend");
                  this.getOpenPosition().then(position => {
                    if (position && position.short.units !== "0") {
                      this.closeShortPosition();
                    }
                    if (position && position.long.units !== "0") {
                      this.closeLongPosition();
                    }
                  });
                  this.hasClosePositionBeforeWeekend = true;
                }
  
                if (
                  (currentDate.getUTCDay() === 5 &&
                    currentDate.getUTCHours() >= 21) ||
                  currentDate.getUTCDay() === 6 ||
                  (currentDate.getUTCDay() === 0 &&
                    currentDate.getUTCHours() < 21)
                ) {
                  //The forex is closed during the weekend from Friday at 9pm UTC to Sunday at 9pm UTC.
                  //So we disable the polling requests
                  if (this.hasClosePositionBeforeWeekend) {
                    console.log("Closed for the weekend. See you Monday...");
                    //It's now close, we set it to false for next weekend
                    this.hasClosePositionBeforeWeekend = false;
                  }
                  return;
                }
  
                const result = candleGenerator.getOandaCandle(
                  ticker,
                  this.priceData
                );
                this.priceData = result.priceData;
                if (
                  result.update &&
                  ticker.type === "PRICE" &&
                  ticker.asks &&
                  ticker.asks.length > 0 &&
                  ticker.bids &&
                  ticker.bids.length > 0
                ) {
                  this.callStrategy(
                    strategy,
                    parseFloat(ticker.bids[0].price),
                    parseFloat(ticker.asks[0].price)
                  );
                }
              },
              err => {
                console.log(
                  `Error retrieving candles via stream on ${this.pairTraded}`
                );
                console.log(err);
              }
            );*/
          })
          .catch(err => {
            console.log(`Error retrieving candles on ${this.pairTraded}`);
            console.log(err);
          });
      });
    });
  }
}
