import { GenericCandle } from "../generic-candle";
const ATR = require("technicalindicators").ATR;

export class ATRPattern {
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
