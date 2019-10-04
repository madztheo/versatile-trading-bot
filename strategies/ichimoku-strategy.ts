import { Signal } from "./signal";
import { StrategyResponse, Strategy } from "./strategy";
import * as Ichimoku from "ichimoku";
import { GenericCandle } from "../generic-candle";
import { ROCPattern } from "./roc-pattern";

export class IchimokuStrategy implements Strategy {
  signalsHistory: { signal: Signal; date: Date; candle?: GenericCandle }[] = [
    {
      signal: Signal.Nothing,
      date: new Date()
    }
  ];
  lock = false;
  trendFocusStrategy = true;

  private canConsiderSignal(
    priceData: GenericCandle[],
    signal: Signal,
    trendFocus = true
  ) {
    this.trendFocusStrategy = trendFocus;
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
    /*if (
      this.signalsHistory[0].signal === Signal.StrongBuy ||
      this.signalsHistory[0].signal === Signal.Buy ||
      this.signalsHistory[0].signal === Signal.StrongSell ||
      this.signalsHistory[0].signal === Signal.Sell
    ) {
      console.log(this.signalsHistory[0]);
    }*/
    if (this.signalsHistory.length > 1000) {
      this.signalsHistory.pop();
    }
  }

  getStopLossDistance(currentCandle: GenericCandle) {
    for (let i = 0; i < this.signalsHistory.length; i++) {
      if (
        (this.signalsHistory[i].signal === Signal.DownwardsBreakout ||
          this.signalsHistory[i].signal === Signal.DownwardsCrossover) &&
        this.signalsHistory[i].candle
      ) {
        const lastSignalCandle = this.signalsHistory[i].candle;
        return Math.abs(currentCandle.close - lastSignalCandle.high);
      } else if (
        (this.signalsHistory[i].signal === Signal.UpwardsBreakout ||
          this.signalsHistory[i].signal === Signal.UpwardsCrossover) &&
        this.signalsHistory[i].candle
      ) {
        const lastSignalCandle = this.signalsHistory[i].candle;
        return Math.abs(currentCandle.close - lastSignalCandle.low);
      }
    }
  }

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

  //Get the previous signal while taking out the Nothing in between
  private findPreviousSignal() {
    for (let i = 1; i < this.signalsHistory.length; i++) {
      if (this.signalsHistory[i].signal !== Signal.Nothing) {
        return this.signalsHistory[i].signal;
      }
    }
  }

  //Get the last crossover signal generated
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

  private detectSignalForTrendFocusStrategy(
    ichimoku: {
      conversion: number;
      base: number;
      spanA: number;
      spanB: number;
    }[],
    priceData: GenericCandle[]
  ) {
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
      priceData[0].close > ichimoku[0].spanB
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongBuy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line upwards above the cloud giving a strong buy signal
      this.addSignalToHistory(Signal.StrongBuy, priceData[0]);
      this.lock = false;
      return Signal.StrongBuy;
    } else if (
      this.signalsHistory.length > 1 &&
      this.findPreviousCrossoverSignal() === Signal.UpwardsCrossover &&
      this.signalsHistory[0].signal === Signal.UpwardsBreakout
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Buy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the price went above the cloud while an upwards crossover of the conversion line
      //and the base line happened before
      this.addSignalToHistory(Signal.Buy, priceData[0]);
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
      priceData[0].close < ichimoku[0].spanB
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongSell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line downwards below the cloud giving a strong sell signal
      this.addSignalToHistory(Signal.StrongSell, priceData[0]);
      this.lock = false;
      return Signal.StrongSell;
    } else if (
      this.signalsHistory.length > 1 &&
      this.findPreviousCrossoverSignal() === Signal.DownwardsCrossover &&
      this.signalsHistory[0].signal === Signal.DownwardsBreakout
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Sell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the price went below the cloud while an downwards crossover of the conversion line
      //and the base line happened before
      this.addSignalToHistory(Signal.Sell, priceData[0]);
      this.lock = false;
      return Signal.Sell;
    } else if (
      (priceData[2].high <= ichimoku[2].spanA ||
        priceData[2].high <= ichimoku[2].spanB) &&
      priceData[1].high > ichimoku[1].spanA &&
      priceData[1].high > ichimoku[1].spanB &&
      priceData[0].high > ichimoku[0].spanA &&
      priceData[0].high > ichimoku[0].spanB
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.UpwardsBreakout)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the price broke out above the cloud, we just add it to the history for later use
      // We want the data of the candle that went through the cloud
      this.addSignalToHistory(Signal.UpwardsBreakout, priceData[1]);
      this.lock = false;
      //Those don't have to be considered, it's more an internal signal
      return Signal.Nothing;
    } else if (
      (priceData[2].low >= ichimoku[2].spanA ||
        priceData[2].low >= ichimoku[2].spanB) &&
      priceData[1].low < ichimoku[1].spanA &&
      priceData[1].low < ichimoku[1].spanB &&
      priceData[0].low < ichimoku[0].spanA &&
      priceData[0].low < ichimoku[0].spanB
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.DownwardsBreakout)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the price broke out below the cloud, we just add it to the history for later use
      // We want the data of the candle that went through the cloud
      this.addSignalToHistory(Signal.DownwardsBreakout, priceData[1]);
      this.lock = false;
      //Those don't have to be considered, it's more an internal signal
      return Signal.Nothing;
    } else if (
      ichimoku[2].conversion <= ichimoku[2].base &&
      ichimoku[1].conversion > ichimoku[1].base &&
      ichimoku[0].conversion > ichimoku[0].base
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.UpwardsCrossover)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crossed the base line in an upwards direction,
      //we just add it to the history for later use
      this.addSignalToHistory(Signal.UpwardsCrossover, priceData[0]);
      this.lock = false;
      //Those don't have to be considered, it's more an internal signal
      return Signal.ShortExit;
    } else if (
      ichimoku[2].conversion >= ichimoku[2].base &&
      ichimoku[1].conversion < ichimoku[1].base &&
      ichimoku[0].conversion < ichimoku[0].base
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.DownwardsCrossover)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crossed the base line in a downwards direction,
      //we just add it to the history for later use
      this.addSignalToHistory(Signal.DownwardsCrossover, priceData[0]);
      this.lock = false;
      //Those don't have to be considered, it's more an internal signal
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
    //const candlesPattern = new CandlePattern();
    const rocPattern = new ROCPattern();
    const rocSignal = rocPattern.detectROCSignal(priceData);
    //const adlPattern = new ADLPattern();
    //const candleSignal = candlesPattern.detectCandleSignal(priceData);
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
      //&& adlPattern.confirmLongSignal(priceData)
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongBuy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line upwards above the cloud giving a strong buy signal
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
      //&& adlPattern.confirmLongSignal(priceData)
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Buy)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line upwards in a green cloud giving a buying signal
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
      //&& adlPattern.confirmShortSignal(priceData)
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.StrongSell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line downwards below the cloud giving a strong sell signal
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
      //&& adlPattern.confirmShortSignal(priceData)
    ) {
      //To avoid emitting the same signal several times
      if (!this.canConsiderSignal(priceData, Signal.Sell)) {
        this.lock = false;
        return Signal.Nothing;
      }
      //Here the conversion line crosses the base line downwards in a red cloud giving a selling signal
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
      //Here the previous candle body is below the base line while the one before wasn't
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
      //Here the conversion line and base line are the same or the conversion line is below while the conversion was above before
      //giving a long exit
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
      //Here the previous candle body is above the base line while the one before wasn't
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
      //Here the conversion line and base line are the same or the conversion line is above while the conversion was below before
      //giving a short exit
      this.addSignalToHistory(Signal.ShortExit);
      this.lock = false;
      return Signal.ShortExit;
    } else if (rocSignal !== Signal.Nothing) {
      //We detect possible Rate of Change pattern to help us exit our position if necessary
      //to help us exit at the right time
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
    //We don't want to consider candles with no trades
    const filteredPrice = priceData.filter(x => x.volume > 0);
    const values = filteredPrice.map(x => {
      return {
        high: x.high,
        low: x.low,
        close: x.close
      };
    });
    const ichimoku = new Ichimoku({
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
