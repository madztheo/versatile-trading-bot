import { GenericCandle } from "../generic-candle";
import { Signal } from "./signal";
const ROC = require("technicalindicators").ROC;

export class ROCPattern {
  detectROCSignal(priceData: GenericCandle[]): Signal {
    const results = ROC.calculate({
      period: 12,
      values: priceData.map(x => x.close),
      reversedInput: true
    });
    if (results[0] > 0 && results[1] > 0) {
      //If we go above zero, it's time to close our shorts
      return Signal.ShortExit;
    } else if (results[0] < 0 && results[1] < 0) {
      //If we go below zero, it's time to close our longs
      return Signal.LongExit;
    }
    return Signal.Nothing;
  }

  /**
   * Confirm whether a long signal should be triggered in the current condition.
   * IMPORTANT : This doesn't act as a signal on its own, just a confirmation of
   * an already detected signal
   * @param priceData
   */
  confirmLongSignal(priceData: GenericCandle[]): boolean {
    const results = ROC.calculate({
      period: 12,
      values: priceData.map(x => x.close),
      reversedInput: true
    });
    // We want to be above zero to confirm the buy signal
    return results[0] > 0 && results[1] > 0;
  }

  /**
   * Confirm whether a short signal should be triggered in the current condition.
   * IMPORTANT : This doesn't act as a signal on its own, just a confirmation of
   * an already detected signal
   * @param priceData
   */
  confirmShortSignal(priceData: GenericCandle[]): boolean {
    const results = ROC.calculate({
      period: 12,
      values: priceData.map(x => x.close),
      reversedInput: true
    });
    // We want to be below zero to confirm the sell signal
    return results[0] < 0 && results[1] < 0;
  }
}
