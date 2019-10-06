import { GenericCandle } from "../generic-candle";
const ATR = require("technicalindicators").ATR;

/**
 * The ATR (Average True Range) is an indicator commonly
 * used to set stop loss as it helps to take into account the
 * current volatility
 */
export class ATRPattern {
  /**
   * Get the stop loss distance for the current price
   * by using the value of the ATR multiplied by 2.
   * That factor is most of the times between 2 and 3 depending
   * on how much margin you want to give your trade.
   * TO-DO: add a parameter to set the factor
   * @param priceData The price data
   */
  getStopLossDistance(priceData: GenericCandle[]) {
    const atr = ATR.calculate({
      period: 14,
      high: priceData.map(x => x.high),
      low: priceData.map(x => x.low),
      close: priceData.map(x => x.close),
      reversedInput: true
    });
    return atr[0] * 2;
  }
}
