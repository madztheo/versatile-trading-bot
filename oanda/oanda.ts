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

export abstract class Oanda {
  pairTraded = "EUR_USD";
  priceData: GenericCandle[];
  currentStrategy = "Ichimoku";
  period = 5;
  instrumentDetails: Instrument;
  realTrade = false;
  nbOfPairsTraded = 1;
  accountSummary: AccountSummary;
  strategy: Strategy;
  oandaAPI: OandaAPI;

  protected convertToGenericCandles(
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

  getSpread(bid: number, ask: number) {
    const spread = Math.abs(ask - bid);
    return spread * Math.pow(10, Math.abs(this.instrumentDetails.pipLocation));
  }

  isSpreadSmallEnough(bid: number, ask: number) {
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

  async getConversionRate(date?: Date) {
    if (!date) {
      const homeConversions = await this.oandaAPI.getConversionRates();
      const conversion = homeConversions.find(x =>
        this.instrumentDetails.displayName.startsWith(x.currency)
      );
      return parseFloat(conversion.positionValue);
    } else {
      const rate = await this.oandaAPI.getPastConversionRate(
        this.accountSummary.currency,
        date,
        this.getStringPeriod()
      );
      return rate;
    }
  }

  async getUnits(funds: number, date?: Date) {
    const accountMarginRate = parseFloat(this.accountSummary.marginRate);
    const instrumentMarginRate = parseFloat(this.instrumentDetails.marginRate);
    const marginRate =
      instrumentMarginRate > accountMarginRate
        ? instrumentMarginRate
        : accountMarginRate;
    // It's the same as the account currency, no conversion needed
    if (
      this.instrumentDetails.displayName.startsWith(
        this.accountSummary.currency
      )
    ) {
      return Math.floor(funds / marginRate);
    } else {
      /**
       * cf. https://www1.oanda.com/forex-trading/analysis/currency-units-calculator
       * Note that the margin rate here is the inverse of the margin ratio indicated
       * in the formula given in the link, hence the division and not multiplication.
       */
      const rate = await this.getConversionRate(date);
      return Math.floor(funds / marginRate / rate);
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
    const allocableFundsInAccountCurrency = this.getAllocableFunds(bigTrade);
    return this.getUnits(allocableFundsInAccountCurrency);
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
}
