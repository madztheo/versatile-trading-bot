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
import { Oanda } from "./oanda";

/**
 * Note: Backtracking doesn't take stop loss or financing into account
 * so the results are not fully reliable. But it can give you an idea of
 * the overall efficiency of a given strategy.
 */
export class OandaBacktracking extends Oanda {
  priceData: GenericCandle[];
  hasClosePositionBeforeWeekend = false;
  backTrackingPosition: {
    units: number;
    entryPrice: number;
    type: "long" | "short";
  };
  tradingInterval: any;

  constructor(
    strategy = "Ichimoku",
    period = 5,
    asset = "EUR_USD",
    pairsTraded = 1
  ) {
    super(strategy, period, asset, true, pairsTraded);
  }

  private async closeLongPosition(bid?: number) {
    let accountBalance = parseFloat(this.accountSummary.balance);
    // cf. https://www1.oanda.com/forex-trading/analysis/profit-calculator/
    const rate = await this.oandaAPI.getClosingConversionRate(
      this.accountSummary.currency,
      this.priceData[0].time,
      this.getStringPeriod()
    );
    const profits =
      (bid - this.backTrackingPosition.entryPrice) *
      rate *
      this.backTrackingPosition.units;
    accountBalance += profits;
    this.accountSummary.balance = accountBalance.toString();
    console.log(`New balance on ${this.pairTraded}`);
    console.log(this.accountSummary.balance);
    this.backTrackingPosition = null;
  }

  private async closeShortPosition(ask?: number) {
    let accountBalance = parseFloat(this.accountSummary.balance);
    // cf. https://www1.oanda.com/forex-trading/analysis/profit-calculator/
    const rate = await await this.oandaAPI.getClosingConversionRate(
      this.accountSummary.currency,
      this.priceData[0].time,
      this.getStringPeriod()
    );
    const profits =
      (this.backTrackingPosition.entryPrice - ask) *
      rate *
      this.backTrackingPosition.units;
    accountBalance += profits;
    this.accountSummary.balance = accountBalance.toString();
    console.log(`New balance on ${this.pairTraded}`);
    console.log(this.accountSummary.balance);
    this.backTrackingPosition = null;
  }

  getAllocableUnits(bigTrade = false) {
    const allocableFundsAccountCurrency = this.getAllocableFunds(bigTrade);
    return this.getUnits(allocableFundsAccountCurrency, this.priceData[0].time);
  }

  async openLong(bigPosition: boolean, bid: number, ask: number) {
    if (
      this.backTrackingPosition &&
      this.backTrackingPosition.type === "long"
    ) {
      // One position at a time
      throw new Error("A similar position is already opened");
    }
    if (this.backTrackingPosition) {
      await this.closeShortPosition(ask);
    }
    if (!this.isSpreadSmallEnough(bid, ask)) {
      throw new Error("The spread is too wide for now");
    }
    const units = await this.getAllocableUnits(bigPosition);
    this.backTrackingPosition = {
      units: units,
      entryPrice: ask,
      type: "long"
    };
  }

  async openShort(bigPosition: boolean, bid: number, ask: number) {
    if (
      this.backTrackingPosition &&
      this.backTrackingPosition.type === "short"
    ) {
      // One position at a time
      throw new Error("A similar position is already opened");
    }
    if (this.backTrackingPosition) {
      await this.closeLongPosition(bid);
    }
    if (!this.isSpreadSmallEnough(bid, ask)) {
      throw new Error("The spread is too wide for now");
    }
    const units = await this.getAllocableUnits(bigPosition);
    this.backTrackingPosition = {
      units: units,
      entryPrice: bid,
      type: "short"
    };
  }

  async analyseSignal(signal: Signal, bid: number, ask: number) {
    if (signal === Signal.Buy || signal === Signal.StrongBuy) {
      try {
        await this.openLong(signal === Signal.StrongBuy, bid, ask);
      } catch (err) {
        console.log(`Error on ${this.pairTraded}`);
      }
    } else if (signal === Signal.Sell || signal === Signal.StrongSell) {
      try {
        await this.openShort(signal === Signal.StrongSell, bid, ask);
      } catch (err) {
        console.log(`Error on ${this.pairTraded}`);
      }
    } else if (signal === Signal.LongExit) {
      if (
        this.backTrackingPosition &&
        this.backTrackingPosition.type === "long"
      ) {
        try {
          await this.closeLongPosition(bid);
        } catch (error) {
          console.log(`Error on ${this.pairTraded}`);
        }
      }
    } else if (signal === Signal.ShortExit) {
      if (
        this.backTrackingPosition &&
        this.backTrackingPosition.type === "short"
      ) {
        try {
          await this.closeShortPosition(ask);
        } catch (error) {
          console.log(`Error on ${this.pairTraded}`);
        }
      }
    }
  }

  async callStrategy(strategy: Strategy, bid: number, ask: number) {
    const strategyRes = strategy.getStrategy(this.priceData);
    if (strategyRes.signal !== Signal.Nothing) {
      // We only need the account info for entry signals
      console.log("\n==== New signal ====");
      console.log(this.priceData[0].time);
      console.log(strategyRes.signal);
      await this.analyseSignal(strategyRes.signal, bid, ask);
    }
  }

  async startBacktracking() {
    const stringPeriod = this.getStringPeriod();
    try {
      const account = await this.oandaAPI.getAccountSummary();
      this.accountSummary = account;
      const instrument = await this.oandaAPI.getInstrumentDetails();
      this.instrumentDetails = instrument;
      const candles = await this.oandaAPI.getCandles(1500, stringPeriod);
      if (!candles) {
        // We start again as long as we don't have a proper answer
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
      // We want the newest candle first
      const allOrderedCandles = candles.sort(
        (a, b) => new Date(b.time).valueOf() - new Date(a.time).valueOf()
      );
      const allGenericCandles = this.convertToGenericCandles(
        allOrderedCandles
      ).sort((a, b) => b.time.valueOf() - a.time.valueOf());
      this.priceData = allGenericCandles.slice(allGenericCandles.length - 500);

      console.log("Starting balance");
      console.log(this.accountSummary.balance);

      for (
        let candleNb = allGenericCandles.length - 501;
        candleNb >= 0;
        candleNb--
      ) {
        const lastCandles = [allOrderedCandles[candleNb]];
        this.priceData.unshift(...this.convertToGenericCandles(lastCandles));
        await this.callStrategy(
          this.strategy,
          parseFloat(lastCandles[0].bid.c),
          parseFloat(lastCandles[0].ask.c)
        );
        if (parseFloat(this.accountSummary.balance) <= 0) {
          console.log("Game over");
          break;
        }
      }
      console.log("Back tracking over");
      console.log(`Final balance on ${this.pairTraded}`);
      console.log(this.accountSummary.balance);
    } catch (err) {
      console.log(`Error on ${this.pairTraded}`);
      console.log(err);
    }
  }
}
