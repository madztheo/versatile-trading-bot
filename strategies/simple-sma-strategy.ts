import * as technicalIndicators from "technicalindicators";
import { Signal } from "./signal";
import { StrategyResponse, Strategy } from "./strategy";
import { GenericCandle } from "../generic-candle";
import { CandlePattern } from "./candle-pattern";
const SMA = technicalIndicators.SMA;

/**
 * The Simple Moving Average (SMA) is one of the most common
 * technical indicator. It smooths the price by averaging it
 * over a certain period of time and is displayed as a curve on
 * charts. The longer the period is the less sensitive to price
 * changes the moving average is.
 * Moving averages are used at least in pairs and often in group of 3.
 * Those 3 moving averages have a different period each. A short one,
 * which tends to between 10 and 20, a medium one which tends to be
 * between 20 and 50, and a long one which tends to be between 50 and 200.
 * The crossovers of those lines then serves as signals.
 */
export class SimpleSMAStrategy implements Strategy {
  shortPeriod: number;
  longPeriod: number;
  basePeriod: number;
  lastSignalEmitted = Signal.Nothing;

  constructor(shPeriod = 10, lgPeriod = 20, basePeriod = 50) {
    this.shortPeriod = shPeriod;
    this.longPeriod = lgPeriod;
    this.basePeriod = basePeriod;
  }

  private getSMA(period: number, values: number[]): number[] {
    /**
     * The default order is the newest at the last index but here
     * Coinbase send the newest at the first index so we indicate that
     * we want the data to be considered that way for the EMA too
     * */
    return SMA.calculate({ period, values, reversedInput: true });
  }

  private detectCrossing(
    shortMA: number[],
    longMA: number[],
    baseMA: number[],
    priceData: GenericCandle[]
  ): Signal {
    const candlesPattern = new CandlePattern();
    const candleSignal = candlesPattern.detectCandleSignal(priceData);
    if (
      shortMA[0] > longMA[0] && // Current candle: the short MA is above the long MA
      longMA[1] <= baseMA[1] && // Previous candle: the long MA is below or equal to the base MA
      longMA[0] > baseMA[0] // Current candle: the long MA is now above the base MA
    ) {
      // To avoid emitting the same signal several times
      if (this.lastSignalEmitted === Signal.StrongBuy) {
        return Signal.Nothing;
      }
      // Here the long MA crosses the base MA with the short MA being
      // above the long MA. This a strong buy signal
      this.lastSignalEmitted = Signal.StrongBuy;
      return Signal.StrongBuy;
    } else if (
      shortMA[1] <= longMA[1] && // Previous candle: The short MA is below or equal to the long MA
      shortMA[0] > longMA[0] // Current candle: The short MA is above the long MA
    ) {
      // To avoid emitting the same signal several times
      if (this.lastSignalEmitted === Signal.Buy) {
        return Signal.Nothing;
      }
      // Here the short MA crosses the long MA upwards giving a buying signal
      this.lastSignalEmitted = Signal.Buy;
      return Signal.Buy;
    } else if (
      shortMA[1] >= longMA[1] && // Previous candle: the short MA is above or equal to the long MA
      shortMA[0] < longMA[0] // Current candle: the short MA is now below the long MA
    ) {
      // To avoid emitting the same signal several times
      if (this.lastSignalEmitted === Signal.Sell) {
        return Signal.Nothing;
      }
      // Here the short MA crosses the long MA downwards giving a selling signal
      this.lastSignalEmitted = Signal.Sell;
      return Signal.Sell;
    } else if (
      shortMA[0] < longMA[0] && // Current candle: the short MA is below the long MA
      longMA[1] >= baseMA[1] && // Previous candle: the long MA is above or equal to the base MA
      longMA[0] < baseMA[0] // Current candle: the long MA is now below the base MA
    ) {
      // To avoid emitting the same signal several times
      if (this.lastSignalEmitted === Signal.StrongSell) {
        return Signal.Nothing;
      }
      // Here the long MA crosses the base MA with the short MA being
      // below the long MA. This a strong sell signal
      this.lastSignalEmitted = Signal.StrongSell;
      return Signal.StrongSell;
    } else if (candleSignal !== Signal.Nothing) {
      // We detect possible candle pattern to help us exit our position if necessary
      if (this.lastSignalEmitted === candleSignal) {
        return Signal.Nothing;
      }
      this.lastSignalEmitted = candleSignal;
      return candleSignal;
    } else {
      // Nothing particular
      this.lastSignalEmitted = Signal.Nothing;
      return Signal.Nothing;
    }
  }

  getStrategy(priceData: GenericCandle[]): StrategyResponse {
    // We don't want to consider candles with no trades
    const filteredPrice = priceData.filter(x => x.volume > 0);
    const closeValues = filteredPrice.map(x => x.close);
    const SMAShort = this.getSMA(this.shortPeriod, closeValues);
    const SMALong = this.getSMA(this.longPeriod, closeValues);
    const SMABase = this.getSMA(this.basePeriod, closeValues);
    const signal = this.detectCrossing(
      SMAShort,
      SMALong,
      SMABase,
      filteredPrice
    );

    return {
      signal: signal,
      data: [
        {
          shortMA: SMAShort[1],
          longMA: SMALong[1],
          baseMA: SMABase[1]
        },
        {
          shortMA: SMAShort[0],
          longMA: SMALong[0],
          baseMA: SMABase[0]
        }
      ]
    };
  }
}
