import { GenericCandle } from "../generic-candle";
const ADL = require("technicalindicators").ADL;
const SMA = require("technicalindicators").SMA;

export class ADLPattern {
  private getADL(priceData: GenericCandle[]) {
    return ADL.calculate({
      high: priceData.map(x => x.high),
      low: priceData.map(x => x.low),
      close: priceData.map(x => x.close),
      volume: priceData.map(x => x.volume),
      reversedInput: true
    });
  }

  /**
   * Confirm whether a long signal should be triggered in the current condition.
   * IMPORTANT : This doesn't act as a signal on its own, just a confirmation of
   * an already detected signal
   * @param priceData
   */
  confirmLongSignal(priceData: GenericCandle[]): boolean {
    const results = this.getADL(priceData);
    const smaResults = SMA.calculate({
      period: 10,
      values: results,
      reversedInput: true
    });
    //If the Accumulation Distribution is above or equal to its 10 SMA,
    //we can give the confirmation for the buy signal
    return results[0] >= smaResults[0] && results[1] >= smaResults[1];
  }

  /**
   * Confirm whether a short signal should be triggered in the current condition.
   * IMPORTANT : This doesn't act as a signal on its own, just a confirmation of
   * an already detected signal
   * @param priceData
   */
  confirmShortSignal(priceData: GenericCandle[]): boolean {
    const results = this.getADL(priceData);
    const smaResults = SMA.calculate({
      period: 10,
      values: results,
      reversedInput: true
    });
    //If the Accumulation Distribution is below or equal to its 10 SMA,
    //we can give the confirmation for the sell signal
    return results[0] <= smaResults[0] && results[1] <= smaResults[1];
  }
}
