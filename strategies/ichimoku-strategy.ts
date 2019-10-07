import { Signal } from "./signal";
import { StrategyResponse, Strategy } from "./strategy";
import Ichimoku from "ichimoku";
import { GenericCandle } from "../generic-candle";
import { ROCPattern } from "./roc-pattern";

/**
 * The Ichimoku Cloud is a Japanese technical indicator which looks
 * quite daunting at first but is one of the best indicator in my opinion.
 * It takes sometime to get around it and properly make the most of its potential,
 * but once you fully grasp it, it turns out to be a fairly reliable indicator to
 * follow trends.
 * I have mostly worked on this strategy as to date it remains my favorite indicator.
 * This strategy is best suited for 1h or 4h periods.
 * It is not recommended to use it with shorter periods.
 * Longer periods may be tried.
 */
export class IchimokuStrategy implements Strategy {
  /**
   * The Ichimoku Strategy requires a signal history as it needs
   * to consider several signals to initiate a buy or sell signal
   */
  private signalsHistory: {
    signal: Signal;
    date: Date;
    candle?: GenericCandle;
  }[] = [];
  private lock = false;
  private trendFocusStrategy = true;

  constructor(trendFocus = true) {
    this.trendFocusStrategy = trendFocus;
  }

  private canConsiderSignal(priceData: GenericCandle[], signal: Signal) {
    const lastCandleTime = new Date(priceData[0].time);
    const nextCandleTime = new Date(priceData[0].time);
    const periodInSeconds =
      (lastCandleTime.valueOf() - priceData[1].time.valueOf()) / 1000;
    nextCandleTime.setSeconds(nextCandleTime.getSeconds() + periodInSeconds);
    //If the same signal has already been emitted in the current candle, we don't consider it
    return !this.signalsHistory.find(
      x =>
        x.date >= lastCandleTime &&
        x.date < nextCandleTime &&
        x.signal === signal
    );
  }

  private addSignalToHistory(signal: Signal, candle?: GenericCandle) {
    //We don't want to add too many Nothing signals,
    //that would overcharge the array for nothing
    if (
      this.signalsHistory.length > 0 &&
      signal === Signal.Nothing &&
      this.signalsHistory[0].signal === Signal.Nothing
    ) {
      return;
    }
    this.signalsHistory.unshift({
      signal,
      date: new Date(),
      candle
    });
    /**
     * We keep the signal history to a reasonable length.
     * Since we add elements at the start with unshift
     * we pop the last item (i.e. oldest) to free some
     * space
     */
    if (this.signalsHistory.length > 1000) {
      this.signalsHistory.pop();
    }
  }

  /**
   * Get the price for the stop loss
   */
  getStopLossPrice() {
    for (let i = 0; i < this.signalsHistory.length; i++) {
      if (
        (this.signalsHistory[i].signal === Signal.DownwardsBreakout ||
          this.signalsHistory[i].signal === Signal.DownwardsCrossover) &&
        this.signalsHistory[i].candle
      ) {
        const lastSignalCandle = this.signalsHistory[i].candle;
        return lastSignalCandle.high;
      } else if (
        (this.signalsHistory[i].signal === Signal.UpwardsBreakout ||
          this.signalsHistory[i].signal === Signal.UpwardsCrossover) &&
        this.signalsHistory[i].candle
      ) {
        const lastSignalCandle = this.signalsHistory[i].candle;
        return lastSignalCandle.low;
      }
    }
  }

  /**
   * Get the distance from the current price for the stop loss.
   * @param currentCandle The candle in which the position has been opened
   */
  getStopLossDistance(currentCandle: GenericCandle) {
    return Math.abs(currentCandle.close - this.getStopLossPrice());
  }

  /**
   * Get the previous signal while taking out the Nothing in between
   */
  private findPreviousSignal() {
    for (let i = 1; i < this.signalsHistory.length; i++) {
      if (this.signalsHistory[i].signal !== Signal.Nothing) {
        return this.signalsHistory[i].signal;
      }
    }
  }

  /**
   * Get the latest crossover signal generated
   */
  private findPreviousCrossoverSignal() {
    for (let i = 1; i < this.signalsHistory.length; i++) {
      if (
        this.signalsHistory[i].signal === Signal.UpwardsCrossover ||
        this.signalsHistory[i].signal === Signal.DownwardsCrossover
      ) {
        return this.signalsHistory[i].signal;
      }
    }
  }

  /**
   * Detect signals with the Ichimoku indicator by staying focus on going with the flow
   * during strong trends
   * @param ichimoku The computed Ichimoku values
   * @param priceData The candles
   */
  private detectSignalForTrendFocusStrategy(
    ichimoku: {
      // The lines
      conversion: number;
      base: number;
      // The cloud
      spanA: number;
      spanB: number;
    }[],
    priceData: GenericCandle[]
  ) {
    if (
      ichimoku[2].conversion <= ichimoku[2].base && // Candle before the previous one: The conversion line was below or equals to the base
      ichimoku[1].conversion > ichimoku[1].base && // Previous candle: the conversion line went above the base
      ichimoku[0].conversion > ichimoku[0].base && // Current candle: the conversion line is still above the base
      ichimoku[1].conversion > ichimoku[1].spanA && // Previous candle: the conversion line is above span A and B, so above the cloud
      ichimoku[1].conversion > ichimoku[1].spanB &&
      ichimoku[1].base > ichimoku[1].spanA && // Previous candle: the base is above span A and B (i.e. above the cloud)
      ichimoku[1].base > ichimoku[1].spanB &&
      priceData[1].close > ichimoku[1].spanA && // Previous candle: the closing price is above the cloud (span A and B)
      priceData[1].close > ichimoku[1].spanB &&
      priceData[0].close > ichimoku[0].spanA && // Current candle: the closing price is above the cloud (span A and B)
      priceData[0].close > ichimoku[0].spanB
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongBuy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line upwards above the cloud giving a strong buy signal
      this.addSignalToHistory(Signal.StrongBuy, priceData[0]);
      this.lock = false;
      return Signal.StrongBuy;
    } else if (
      this.signalsHistory.length > 1 &&
      this.findPreviousCrossoverSignal() === Signal.UpwardsCrossover && // The previous signal is an upwards crossover
      this.signalsHistory[0].signal === Signal.UpwardsBreakout // The current signal is an upwards breakout
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Buy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the price went above the cloud while an upwards crossover of the conversion line
      // and the base line happened before
      this.addSignalToHistory(Signal.Buy, priceData[0]);
      this.lock = false;
      return Signal.Buy;
    } else if (
      ichimoku[2].conversion >= ichimoku[2].base && // Candle before the previous one: the conversion was above or equals to the base
      ichimoku[1].conversion < ichimoku[1].base && // Previous candle: the conversion was below the base
      ichimoku[0].conversion < ichimoku[0].base && // Currrent candle: the conversion is still below the base
      ichimoku[1].conversion < ichimoku[1].spanA && // Previous candle: the conversion is below the cloud (i.e. span A and B)
      ichimoku[1].conversion < ichimoku[1].spanB &&
      ichimoku[1].base < ichimoku[1].spanA && // Previous candle: the base is below the cloud (i.e. span A and B)
      ichimoku[1].base < ichimoku[1].spanB &&
      priceData[1].close < ichimoku[1].spanA && // Previous candle: the price is below the cloud (i.e. span A and B)
      priceData[1].close < ichimoku[1].spanB &&
      priceData[0].close < ichimoku[0].spanA && // Current candle: the price is below the cloud (i.e. span A and B)
      priceData[0].close < ichimoku[0].spanB
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongSell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line downwards below the cloud giving a strong sell signal
      this.addSignalToHistory(Signal.StrongSell, priceData[0]);
      this.lock = false;
      return Signal.StrongSell;
    } else if (
      this.signalsHistory.length > 1 &&
      this.findPreviousCrossoverSignal() === Signal.DownwardsCrossover && // The previous signal was a downwards crossover
      this.signalsHistory[0].signal === Signal.DownwardsBreakout // The current signal is a downwards breakout
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Sell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the price went below the cloud while an downwards crossover of the conversion line
      // and the base line happened before
      this.addSignalToHistory(Signal.Sell, priceData[0]);
      this.lock = false;
      return Signal.Sell;
    } else if (
      (priceData[2].high <= ichimoku[2].spanA ||
        priceData[2].high <= ichimoku[2].spanB) && // Candle before the previous one: the highest price is either below or inside the cloud
      priceData[1].high > ichimoku[1].spanA && // Previous candle: the highest price is now above the cloud
      priceData[1].high > ichimoku[1].spanB &&
      priceData[0].high > ichimoku[0].spanA && // Current candle: the highest price is still above the cloud
      priceData[0].high > ichimoku[0].spanB
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.UpwardsBreakout)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the price broke out above the cloud, we just add it to the history for later use
      // We want the data of the candle that went through the cloud
      this.addSignalToHistory(Signal.UpwardsBreakout, priceData[1]);
      this.lock = false;
      // Those don't have to be considered, it's more an internal signal
      return Signal.Nothing;
    } else if (
      (priceData[2].low >= ichimoku[2].spanA ||
        priceData[2].low >= ichimoku[2].spanB) && // Candle before the previous one: the lowest price is either above or inside the cloud
      priceData[1].low < ichimoku[1].spanA && // Previous candle: the lowest price is now below the cloud
      priceData[1].low < ichimoku[1].spanB &&
      priceData[0].low < ichimoku[0].spanA && // Current candle: the lowest price is still below the cloud
      priceData[0].low < ichimoku[0].spanB
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.DownwardsBreakout)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the price broke out below the cloud, we just add it to the history for later use
      // We want the data of the candle that went through the cloud
      this.addSignalToHistory(Signal.DownwardsBreakout, priceData[1]);
      this.lock = false;
      // Those don't have to be considered, it's more an internal signal
      return Signal.Nothing;
    } else if (
      ichimoku[2].conversion <= ichimoku[2].base && // Candle before the previous one: the conversion is below or equal to the base
      ichimoku[1].conversion > ichimoku[1].base && // Previous candle: the conversion is now above the base
      ichimoku[0].conversion > ichimoku[0].base // Current candle: the conversion is still above the base
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.UpwardsCrossover)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crossed the base line in an upwards direction,
      // we just add it to the history for later use
      this.addSignalToHistory(Signal.UpwardsCrossover, priceData[0]);
      this.lock = false;
      // It also act as a short exit
      return Signal.ShortExit;
    } else if (
      ichimoku[2].conversion >= ichimoku[2].base && // Candle before the previous one: the conversion is above or equal to the base
      ichimoku[1].conversion < ichimoku[1].base && // Previous candle: the conversion is below the base
      ichimoku[0].conversion < ichimoku[0].base // Current candle: the conversion is still below the base
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.DownwardsCrossover)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crossed the base line in a downwards direction,
      // we just add it to the history for later use
      this.addSignalToHistory(Signal.DownwardsCrossover, priceData[0]);
      this.lock = false;
      // It also act as a long exit
      return Signal.LongExit;
    } else {
      // Nothing particular
      this.addSignalToHistory(Signal.Nothing, priceData[0]);
      this.lock = false;
      return Signal.Nothing;
    }
  }

  private detectSignalForRegularStrategy(
    ichimoku: {
      conversion: number;
      base: number;
      spanA: number;
      spanB: number;
    }[],
    priceData: GenericCandle[]
  ) {
    const rocPattern = new ROCPattern();
    const rocSignal = rocPattern.detectROCSignal(priceData);
    if (
      ichimoku[2].conversion <= ichimoku[2].base &&
      ichimoku[1].conversion > ichimoku[1].base &&
      ichimoku[0].conversion > ichimoku[0].base &&
      ichimoku[1].conversion > ichimoku[1].spanA &&
      ichimoku[1].conversion > ichimoku[1].spanB &&
      ichimoku[1].base > ichimoku[1].spanA &&
      ichimoku[1].base > ichimoku[1].spanB &&
      priceData[1].close > ichimoku[1].spanA &&
      priceData[1].close > ichimoku[1].spanB &&
      priceData[0].close > ichimoku[0].spanA &&
      priceData[0].close > ichimoku[0].spanB &&
      rocPattern.confirmLongSignal(priceData)
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongBuy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line upwards above the cloud giving a strong buy signal
      this.addSignalToHistory(Signal.StrongBuy);
      this.lock = false;
      return Signal.StrongBuy;
    } else if (
      ichimoku[2].conversion <= ichimoku[2].base &&
      ichimoku[1].conversion > ichimoku[1].base &&
      ichimoku[0].conversion > ichimoku[0].base &&
      ichimoku[1].conversion > ichimoku[1].spanB &&
      ichimoku[1].base > ichimoku[1].spanB &&
      rocPattern.confirmLongSignal(priceData)
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Buy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line upwards in a green cloud giving a buying signal
      this.addSignalToHistory(Signal.Buy);
      this.lock = false;
      return Signal.Buy;
    } else if (
      ichimoku[2].conversion >= ichimoku[2].base &&
      ichimoku[1].conversion < ichimoku[1].base &&
      ichimoku[0].conversion < ichimoku[0].base &&
      ichimoku[1].conversion < ichimoku[1].spanA &&
      ichimoku[1].conversion < ichimoku[1].spanB &&
      ichimoku[1].base < ichimoku[1].spanA &&
      ichimoku[1].base < ichimoku[1].spanB &&
      priceData[1].close < ichimoku[1].spanA &&
      priceData[1].close < ichimoku[1].spanB &&
      priceData[0].close < ichimoku[0].spanA &&
      priceData[0].close < ichimoku[0].spanB &&
      rocPattern.confirmShortSignal(priceData)
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongSell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line downwards below the cloud giving a strong sell signal
      this.addSignalToHistory(Signal.StrongSell);
      this.lock = false;
      return Signal.StrongSell;
    } else if (
      ichimoku[2].conversion >= ichimoku[2].base &&
      ichimoku[1].conversion < ichimoku[1].base &&
      ichimoku[0].conversion < ichimoku[0].base &&
      ichimoku[1].conversion < ichimoku[1].spanB &&
      ichimoku[1].base < ichimoku[1].spanB &&
      rocPattern.confirmShortSignal(priceData)
    ) {
      // To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Sell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line crosses the base line downwards in a red cloud giving a selling signal
      this.addSignalToHistory(Signal.Sell);
      this.lock = false;
      return Signal.Sell;
    } else if (
      priceData[1].open <= ichimoku[1].base &&
      priceData[1].close <= ichimoku[1].base &&
      priceData[2].open > ichimoku[2].base &&
      priceData[2].close > ichimoku[2].base
    ) {
      if (!this.canConsiderSignal(priceData, Signal.LongExit)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the previous candle body is below the base line while the one before wasn't
      this.addSignalToHistory(Signal.LongExit);
      this.lock = false;
      return Signal.LongExit;
    } else if (
      ichimoku[1].conversion > ichimoku[1].base &&
      ichimoku[0].conversion <= ichimoku[0].base
    ) {
      if (!this.canConsiderSignal(priceData, Signal.LongExit)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line and base line are the same or the conversion line is below while the conversion was above before
      // giving a long exit
      this.addSignalToHistory(Signal.LongExit);
      this.lock = false;
      return Signal.LongExit;
    } else if (
      priceData[1].open >= ichimoku[1].base &&
      priceData[1].close >= ichimoku[1].base &&
      priceData[2].open < ichimoku[2].base &&
      priceData[2].close < ichimoku[2].base
    ) {
      if (!this.canConsiderSignal(priceData, Signal.ShortExit)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the previous candle body is above the base line while the one before wasn't
      this.addSignalToHistory(Signal.ShortExit);
      this.lock = false;
      return Signal.ShortExit;
    } else if (
      ichimoku[1].conversion < ichimoku[1].base &&
      ichimoku[0].conversion >= ichimoku[0].base
    ) {
      if (!this.canConsiderSignal(priceData, Signal.ShortExit)) {
        this.lock = false;
        return Signal.Nothing;
      }
      // Here the conversion line and base line are the same or the conversion line is above while the conversion was below before
      // giving a short exit
      this.addSignalToHistory(Signal.ShortExit);
      this.lock = false;
      return Signal.ShortExit;
    } else if (rocSignal !== Signal.Nothing) {
      // We detect possible Rate of Change pattern to help us exit our position if necessary
      // to help us exit at the right time
      if (!this.canConsiderSignal(priceData, rocSignal)) {
        this.lock = false;
        return Signal.Nothing;
      }
      this.addSignalToHistory(rocSignal);
      this.lock = false;
      return rocSignal;
    } else {
      // Nothing particular
      this.addSignalToHistory(Signal.Nothing);
      this.lock = false;
      return Signal.Nothing;
    }
  }

  private detectSignal(
    ichimoku: {
      conversion: number;
      base: number;
      spanA: number;
      spanB: number;
    }[],
    priceData: GenericCandle[]
  ): Signal {
    if (this.lock) {
      //Just in case
      return;
    }
    this.lock = true;
    if (this.trendFocusStrategy) {
      return this.detectSignalForTrendFocusStrategy(ichimoku, priceData);
    } else {
      return this.detectSignalForRegularStrategy(ichimoku, priceData);
    }
  }

  getStrategy(priceData: GenericCandle[]): StrategyResponse {
    if (!priceData || priceData.length < 200) {
      throw new Error("candle array too short");
    }
    // We don't want to consider candles with no trades
    const filteredPrice = priceData.filter(x => x.volume > 0);
    const values = filteredPrice.map(x => {
      return {
        high: x.high,
        low: x.low,
        close: x.close
      };
    });
    const ichimoku = new Ichimoku({
      /**
       * Those are the standard values for Ichimoku
       * They are rarely changed
       * */
      conversionPeriod: 9,
      basePeriod: 26,
      spanPeriod: 52,
      displacement: 26,
      values: []
    });
    const results = [];
    for (let i = values.length - 1; i >= 0; i--) {
      results.unshift(
        ichimoku.nextValue({
          high: values[i].high,
          low: values[i].low,
          close: values[i].close
        })
      );
    }

    // To build up the signal history
    if (this.signalsHistory.length === 0 && filteredPrice.length >= 150) {
      for (let i = filteredPrice.length - 101; i > 0; i--) {
        const startIndex = -1 * (filteredPrice.length - i);
        this.detectSignal(
          results.slice(startIndex),
          filteredPrice.slice(startIndex)
        );
      }
    }

    const signal = this.detectSignal(results, filteredPrice);
    return {
      signal,
      data: [
        //Previous
        {
          ichimoku: results[1],
          price: priceData[1].close
        },
        //Current
        {
          ichimoku: results[0],
          price: priceData[0].close
        }
      ]
    };
  }
}
