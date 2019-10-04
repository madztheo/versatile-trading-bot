import { GenericCandle } from "../generic-candle";
import { Signal } from "./signal";

export class CandlePattern {
  detectCandleSignal(priceData: GenericCandle[]): Signal {
    if (
      priceData[1].close < priceData[1].open &&
      priceData[2].close < priceData[2].open &&
      priceData[3].close < priceData[3].open
    ) {
      //The three previous candles were red candles, it's time to get out of our long position
      return Signal.LongExit;
    } else if (
      priceData[1].close > priceData[1].open &&
      priceData[2].close > priceData[2].open &&
      priceData[3].close > priceData[3].open
    ) {
      //The three previous candles were green candles, it's time to get out of our short position
      return Signal.ShortExit;
    }
    return Signal.Nothing;
  }
}
