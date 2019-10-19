const request = require("request");
import { Observable, Observer } from "rxjs";
import { AccountDetails } from "./interfaces/account-details";
import { CandleStickGranularity } from "./interfaces/candle/candle-stick-granularity";
import { Heartbeat } from "./interfaces/price/heartbeat";
import { Price } from "./interfaces/price/price";
import { CandleStick } from "./interfaces/candle/candle-stick";
import { Position } from "./interfaces/position";
import { Instrument } from "./interfaces/instrument";
import { AccountSummary } from "./interfaces/account-summary";
import { HomeConversions } from "./interfaces/home-conversions";

export class OandaAPI {
  realTrade: boolean;
  testAPI = "https://api-fxpractice.oanda.com";
  realAPI = "	https://api-fxtrade.oanda.com";
  streamingTestApi = "https://stream-fxpractice.oanda.com";
  streamingApi = "https://stream-fxtrade.oanda.com";
  apiKey: string;
  accountID: string;
  pairTraded: string;

  constructor(apiKey, accountID, pairTraded, realTrade = true) {
    this.apiKey = apiKey;
    this.accountID = accountID;
    this.pairTraded = pairTraded;
    this.realTrade = realTrade;
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

  async getAccountDetails(): Promise<AccountDetails> {
    const { account } = await this.singleRequest(
      `/v3/accounts/${this.accountID}`
    );
    return account;
  }

  async getAccountSummary(): Promise<AccountSummary> {
    const { account } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/summary`
    );
    return account;
  }

  getPriceStream(): Observable<Heartbeat | Price> {
    return this.streamRequest(
      `/v3/accounts/${this.accountID}/pricing/stream?instruments=${this.pairTraded}`
    );
  }

  async getPrice(): Promise<Price> {
    const {
      prices: [price]
    } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/pricing?instruments=${this.pairTraded}`
    );
    return price;
  }

  async getInstruments(): Promise<Instrument[]> {
    const { instruments } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/instruments`
    );
    return instruments;
  }

  async getCandle(
    pair: string,
    granularity: CandleStickGranularity,
    date?: Date
  ): Promise<CandleStick> {
    const {
      candles: [candle]
    } = await this.singleRequest(
      `/v3/instruments/${pair}/candles?count=1&price=MBA&granularity=${granularity}&from=${date.toISOString()}`
    );
    return candle;
  }

  /**
   * Get the conversion rate used for calculating profit
   * cf. https://www1.oanda.com/forex-trading/analysis/profit-calculator/
   * @param accountCurrency The currency of the account
   * @param date The date to consider for the rate
   * @param granularity
   */
  async getClosingConversionRate(
    accountCurrency: string,
    date: Date,
    granularity: CandleStickGranularity
  ) {
    const [baseCurrency, quoteCurrency] = this.pairTraded.split("_");
    if (quoteCurrency === accountCurrency) {
      return 1;
    }

    if (baseCurrency === accountCurrency) {
      const candle = await this.getCandle(this.pairTraded, granularity, date);
      const candleClose = parseFloat(candle.mid.c);
      return 1 / candleClose;
    } else {
      /**
       * We are trading a currency pair not including the account own's currency.
       * So we need to get all the pairs available to find the one including the
       * account currency and the quote currency of the traded pair
       */
      const instruments = await this.getInstruments();
      const currencies = instruments.filter(x => x.type === "CURRENCY");
      const pair = currencies.find(
        x => x.name.includes(quoteCurrency) && x.name.includes(accountCurrency)
      );
      if (!pair) {
        throw new Error();
      }
      const [base] = pair.name.split("_");
      const candle = await this.getCandle(pair.name, granularity, date);
      const candleClose = parseFloat(candle.mid.c);
      if (base === accountCurrency) {
        return 1 / candleClose;
      } else {
        return candleClose;
      }
    }
  }

  /**
   * Get the conversion rate used to calculate the number of units at entry
   * @param accountCurrency The currency of the account
   * @param date The date to consider for the rate
   * @param granularity
   */
  async getPastConversionRate(
    accountCurrency: string,
    date: Date,
    granularity: CandleStickGranularity
  ) {
    const [baseCurrency, quoteCurrency] = this.pairTraded.split("_");
    if (baseCurrency === accountCurrency) {
      return 1;
    }

    if (quoteCurrency === accountCurrency) {
      const candle = await this.getCandle(this.pairTraded, granularity, date);
      const candleClose = parseFloat(candle.mid.c);
      return 1 / candleClose;
    } else {
      /**
       * We are trading a currency pair not including the account own's currency.
       * So we need to get all the pairs available to find the one including the
       * account currency and the base currency of the traded pair
       */
      const instruments = await this.getInstruments();
      const currencies = instruments.filter(x => x.type === "CURRENCY");
      const pair = currencies.find(
        x => x.name.includes(baseCurrency) && x.name.includes(accountCurrency)
      );
      if (!pair) {
        throw new Error();
      }
      const [base] = pair.name.split("_");
      const candle = await this.getCandle(pair.name, granularity, date);
      const candleClose = parseFloat(candle.mid.c);
      if (base === accountCurrency) {
        return 1 / candleClose;
      } else {
        return candleClose;
      }
    }
  }

  /**
   * Get the latest conversion rate directly provided by Oanda
   */
  async getConversionRates(): Promise<HomeConversions[]> {
    const { homeConversions } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/pricing?instruments=${this.pairTraded}&includeHomeConversions=true`
    );
    return homeConversions;
  }

  async getInstrumentDetails(): Promise<Instrument> {
    const {
      instruments: [instrument]
    } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/instruments?instruments=${this.pairTraded}`
    );
    return instrument;
  }

  async getCandles(
    count: number,
    granularity: CandleStickGranularity,
    time?: Date
  ): Promise<CandleStick[]> {
    if (count === 0) {
      const { candles } = await this.singleRequest(
        `/v3/instruments/${
          this.pairTraded
        }/candles?price=MBA&granularity=${granularity}&from=${time.toISOString()}`
      );
      return candles;
    } else {
      const { candles } = await this.singleRequest(
        `/v3/instruments/${this.pairTraded}/candles?count=${count}&price=MBA&granularity=${granularity}`
      );
      return candles;
    }
  }

  async getOpenPosition(): Promise<Position> {
    const { position } = await this.singleRequest(
      `/v3/accounts/${this.accountID}/positions/${this.pairTraded}`
    );
    return position;
  }

  async closeLongPosition() {
    return !!(await this.singleRequest(
      `/v3/accounts/${this.accountID}/positions/${this.pairTraded}/close`,
      "PUT",
      {
        longUnits: "ALL"
      }
    ));
  }

  async closeShortPosition() {
    return !!(await this.singleRequest(
      `/v3/accounts/${this.accountID}/positions/${this.pairTraded}/close`,
      "PUT",
      {
        shortUnits: "ALL"
      }
    ));
  }

  private async openOrder(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    const body: any = {
      order: {
        type: "MARKET",
        instrument: this.pairTraded,
        units: units.toString(),
        stopLossOnFill: {
          timeInForce: "GTC",
          distance: stopLossDistance
        }
      }
    };
    if (trailingStopLoss) {
      body.order.trailingStopLossOnFill = {
        timeInForce: "GTC",
        distance: stopLossDistance
      };
    }
    return !!(await this.singleRequest(
      `/v3/accounts/${this.accountID}/orders`,
      "POST",
      body
    ));
  }

  async openLong(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    return this.openOrder(units, stopLossDistance, trailingStopLoss);
  }

  async openShort(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    return this.openOrder(-1 * units, stopLossDistance, trailingStopLoss);
  }
}
