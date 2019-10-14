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
import { OandaAPI } from "./oanda-api";

export class OandaTrader {
  apiKey = "";
  accountID = "";
  pairTraded = "EUR_USD";
  priceData: GenericCandle[];
  canTrade = process.env.CAN_TRADE === "true" ? true : false;
  currentStrategy = "Ichimoku";
  period = 5;
  hasClosePositionBeforeWeekend = false;
  instrumentDetails: Instrument;
  realTrade = false;
  nbOfPairsTraded = 1;
  accountSummary: AccountSummary;
  strategy: Strategy;
  oandaAPI: OandaAPI;
  tradingInterval: any;

  constructor(
    strategy = "Ichimoku",
    period = 5,
    asset = "EUR_USD",
    realTrade = false,
    pairsTraded = 1
  ) {
    this.apiKey = this.realTrade
      ? process.env.OANDA_REAL_API_KEY
      : process.env.OANDA_TEST_API_KEY;
    this.accountID = this.realTrade
      ? process.env.OANDA_REAL_ACCOUNT_ID
      : process.env.OANDA_TEST_ACCOUNT_ID;
    this.pairTraded = asset;
    this.realTrade = realTrade;
    this.currentStrategy = strategy;
    this.period = period;
    this.nbOfPairsTraded = pairsTraded;

    this.oandaAPI = new OandaAPI(
      this.apiKey,
      this.accountID,
      this.pairTraded,
      this.realTrade
    );

    console.log("==== Forex pair ====");
    console.log(`Forex pair traded : ${this.pairTraded}`);
    console.log(`Forex period used : ${this.period} minutes`);
    console.log(`Forex trade ${this.canTrade ? "on" : "off"}`);
    console.log(`Forex strategy : ${this.currentStrategy}`);
    console.log(`Real trading : ${this.realTrade}`);
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

  private closeLongPosition() {
    return this.oandaAPI.closeLongPosition();
  }

  private closeShortPosition() {
    return this.oandaAPI.closeShortPosition();
  }

  getSpread(bid: number, ask: number) {
    const spread = Math.abs(ask - bid);
    return spread * Math.pow(10, Math.abs(this.instrumentDetails.pipLocation));
  }

  isSpreadSmallEnough(bid: number, ask: number) {
    console.log(`Spread on ${this.pairTraded}`);
    console.log(this.getSpread(bid, ask));
    // We allow a wider spread when using a longer period
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

  roundToNDecimals(num: number, decimals: number) {
    return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }

  getStopLossDistance() {
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

  canPlaceEntryOrder() {
    const marginCallPercent = parseFloat(this.accountSummary.marginCallPercent);
    // If it's above or equal to one a margin call has been raised, we don't want to get there
    return marginCallPercent <= 0.9;
  }

  async getUnits(funds: number) {
    const accountMarginRate = parseFloat(this.accountSummary.marginRate);
    const instrumentMarginRate = parseFloat(this.instrumentDetails.marginRate);
    const marginRate =
      instrumentMarginRate > accountMarginRate
        ? instrumentMarginRate
        : accountMarginRate;
    //It's Euro, no conversion needed
    if (this.instrumentDetails.displayName.startsWith("EUR")) {
      return Math.floor(funds / marginRate);
    } else {
      const homeConversions = await this.oandaAPI.getConversionRates();
      const conversion = homeConversions.find(x =>
        this.instrumentDetails.displayName.startsWith(x.currency)
      );
      if (conversion) {
        const rate = parseFloat(conversion.positionValue);
        return Math.floor(funds / marginRate / rate);
      }
      return 0;
    }
  }

  async hasReachFundsLimit(orderUnits: number, allocatedUnits: number) {
    const balance = parseFloat(this.accountSummary.balance);
    const pairFunds = balance / this.nbOfPairsTraded;
    const maxUnits = await this.getUnits(pairFunds);
    return allocatedUnits + orderUnits > maxUnits;
  }

  getAllocableFunds(bigTrade = false) {
    const balance = parseFloat(this.accountSummary.balance);
    // We set the funds evenly accross all pairs traded
    const pairFunds = balance / this.nbOfPairsTraded;
    // If it's a big trade (aka Strong Buy or Sell) we put 2 thirds of the
    // allocable funds otherwise just 1 third
    return bigTrade ? (pairFunds / 3) * 2 : pairFunds / 3;
  }

  getAllocableUnits(bigTrade = false) {
    const allocableFundsInEuro = this.getAllocableFunds(bigTrade);
    return this.getUnits(allocableFundsInEuro);
  }

  async openLong(bigPosition: boolean, bid: number, ask: number) {
    const position = await this.oandaAPI.getOpenPosition();
    if (position && position.long.units !== "0") {
      // One long position at a time
      throw new Error("A similar position is already opened");
    }
    if (position && position.short.units !== "0") {
      await this.closeShortPosition();
    }
    if (!this.isSpreadSmallEnough(bid, ask)) {
      throw new Error("The spread is too wide for now");
    }
    if (!this.canPlaceEntryOrder()) {
      throw new Error("Too close from margin call");
    }
    const allocatedUnits = position
      ? parseInt(position.long.units) + Math.abs(parseInt(position.short.units))
      : 0;
    const units = await this.getAllocableUnits(bigPosition);
    // Not too much
    if (position && (await this.hasReachFundsLimit(units, allocatedUnits))) {
      throw new Error("Too much fund invested");
    }
    return await this.oandaAPI.openLong(units, this.getStopLossDistance());
  }

  async openShort(bigPosition: boolean, bid: number, ask: number) {
    const position = await this.oandaAPI.getOpenPosition();
    if (position && position.short.units !== "0") {
      // One short position at a time
      throw new Error("A similar position is already opened");
    }
    if (position && position.long.units !== "0") {
      await this.closeLongPosition();
    }
    if (!this.isSpreadSmallEnough(bid, ask)) {
      throw new Error("The spread is too wide for now");
    }
    if (!this.canPlaceEntryOrder()) {
      throw new Error("Too close from margin call");
    }
    const allocatedUnits = position
      ? Math.abs(parseInt(position.short.units)) + parseInt(position.long.units)
      : 0;
    const units = await this.getAllocableUnits(bigPosition);
    // Not too much
    if (position && (await this.hasReachFundsLimit(units, allocatedUnits))) {
      throw new Error("Too much fund invested");
    }
    return await this.oandaAPI.openShort(units, this.getStopLossDistance());
  }

  async analyseSignal(signal: Signal, bid: number, ask: number) {
    if (this.canTrade) {
      if (signal === Signal.Buy || signal === Signal.StrongBuy) {
        try {
          const res = await this.openLong(
            signal === Signal.StrongBuy,
            bid,
            ask
          );
          if (this.realTrade) {
            console.log("==== Real trade ====");
          } else {
            console.log("==== Practice trade ====");
          }
          console.log(`Forex long order on ${this.pairTraded}`);
          console.log(res);
          return true;
        } catch (err) {
          console.log(`Error on ${this.pairTraded}`);
          console.log(err);
        }
      } else if (signal === Signal.Sell || signal === Signal.StrongSell) {
        try {
          const res = await this.openShort(
            signal === Signal.StrongSell,
            bid,
            ask
          );
          if (this.realTrade) {
            console.log("==== Real trade ====");
          } else {
            console.log("==== Practice trade ====");
          }
          console.log(`Forex short order on ${this.pairTraded}`);
          console.log(res);
          return true;
        } catch (err) {
          console.log(`Error on ${this.pairTraded}`);
          console.log(err);
        }
      } else if (signal === Signal.LongExit) {
        try {
          const position = await this.oandaAPI.getOpenPosition();
          if (position && position.long.units !== "0") {
            try {
              const res = await this.closeLongPosition();
              if (this.realTrade) {
                console.log("==== Real trade ====");
              } else {
                console.log("==== Practice trade ====");
              }
              console.log(`Exit long position on ${this.pairTraded}`);
              console.log(res);
              return true;
            } catch (error) {
              console.log(`Error on ${this.pairTraded}`);
              console.log(error);
            }
          }
        } catch (err) {
          console.log(`Error while getting position on ${this.pairTraded}`);
          console.log(err);
        }
      } else if (signal === Signal.ShortExit) {
        try {
          const position = await this.oandaAPI.getOpenPosition();
          if (position && position.short.units !== "0") {
            try {
              const res = await this.closeShortPosition();
              if (this.realTrade) {
                console.log("==== Real trade ====");
              } else {
                console.log("==== Practice trade ====");
              }
              console.log(`Exit short position on ${this.pairTraded}`);
              console.log(res);
              return true;
            } catch (err) {
              console.log(`Error on ${this.pairTraded}`);
              console.log(err);
            }
          }
        } catch (err) {
          console.log(`Error while getting position on ${this.pairTraded}`);
          console.log(err);
        }
      }
    }
    return false;
  }

  async callStrategy(strategy: Strategy, bid: number, ask: number) {
    const strategyRes = strategy.getStrategy(this.priceData);
    if (strategyRes.signal !== Signal.Nothing) {
      // We only need the account info for entry signals
      if (
        strategyRes.signal !== Signal.LongExit &&
        strategyRes.signal !== Signal.ShortExit
      ) {
        const account = await this.oandaAPI.getAccountSummary();
        this.accountSummary = account;
      }
      return this.analyseSignal(strategyRes.signal, bid, ask);
    }
    return false;
  }

  getStringPeriod() {
    let stringPeriod: string;
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
    return stringPeriod as CandleStickGranularity;
  }

  async fetchNewData(currentDate: Date) {
    const stringPeriod = this.getStringPeriod();
    if (
      !this.hasClosePositionBeforeWeekend &&
      currentDate.getUTCDay() === 5 &&
      currentDate.getUTCHours() === 20 &&
      currentDate.getUTCMinutes() === 55
    ) {
      // 5 minutes before close we close all positions.
      // We don't want to keep them through the weekend
      console.log("Closing positions before the weekend");
      if (this.period < 60) {
        // We keep the positions open for period above or equal to 1h
        const position = await this.oandaAPI.getOpenPosition();
        if (position && position.short.units !== "0") {
          await this.closeShortPosition();
        }
        if (position && position.long.units !== "0") {
          await this.closeLongPosition();
        }
      }
      this.hasClosePositionBeforeWeekend = true;
    }

    if (
      (currentDate.getUTCDay() === 5 && currentDate.getUTCHours() >= 21) ||
      currentDate.getUTCDay() === 6 ||
      (currentDate.getUTCDay() === 0 && currentDate.getUTCHours() < 21)
    ) {
      // The forex is closed during the weekend from Friday at 9pm UTC to Sunday at 9pm UTC.
      // So we disable the polling requests
      if (this.hasClosePositionBeforeWeekend) {
        console.log("Closed for the weekend. See you Monday...");
        // It's now close, we set it to false for next weekend
        this.hasClosePositionBeforeWeekend = false;
      }
      return false;
    }

    try {
      const newCandles = await this.oandaAPI.getCandles(
        0,
        stringPeriod,
        this.priceData[0].time
      );
      if (!newCandles) {
        return;
      }
      const newOrderedCandles = newCandles.sort(
        (a, b) => new Date(b.time).valueOf() - new Date(a.time).valueOf()
      );
      // To replace the current candle by the same one with updated data
      if (
        newOrderedCandles.find(
          x => new Date(x.time).valueOf() === this.priceData[0].time.valueOf()
        )
      ) {
        this.priceData = this.priceData.filter(
          x => x.time.valueOf() !== this.priceData[0].time.valueOf()
        );
      }
      this.priceData.unshift(
        ...this.convertToGenericCandles(newOrderedCandles)
      );
      // We don't want it to become too large
      if (this.priceData.length > 10000) {
        this.priceData.pop();
      }
      const price = await this.oandaAPI.getPrice();
      if (price) {
        return this.callStrategy(
          this.strategy,
          parseFloat(price.bids[0].price),
          parseFloat(price.asks[0].price)
        );
      }
    } catch (err) {
      console.log(`Error retrieving candles on ${this.pairTraded}`);
      console.log(err);
    }
    return false;
  }

  async start() {
    const stringPeriod = this.getStringPeriod();
    try {
      const account = await this.oandaAPI.getAccountSummary();
      this.accountSummary = account;

      const instrument = await this.oandaAPI.getInstrumentDetails();
      this.instrumentDetails = instrument;
      const candles = await this.oandaAPI.getCandles(500, stringPeriod);
      if (!candles) {
        // We start again as long as we don't have a proper answer
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
      // We want the newest candle first
      this.priceData = this.convertToGenericCandles(candles).sort(
        (a, b) => b.time.valueOf() - a.time.valueOf()
      );

      const today = new Date();
      if (
        (today.getUTCDay() === 5 && today.getUTCHours() >= 21) ||
        today.getUTCDay() === 6 ||
        (today.getUTCDay() === 0 && today.getUTCHours() < 21)
      ) {
        console.log("It's the weekend");
      }

      // We do some polling because the streaming is not reliable
      this.tradingInterval = setInterval(
        () => this.fetchNewData(new Date()),
        5000
      );
    } catch (err) {
      console.log(`Error on ${this.pairTraded}`);
      console.log(err);
    }
  }

  stop() {
    clearInterval(this.tradingInterval);
  }
}
