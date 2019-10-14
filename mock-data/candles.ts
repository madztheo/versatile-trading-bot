import candles from "./generic-candles.json";
import { GenericCandle } from "../generic-candle";

/**
 * EUR/USD pair from 2019-08-08 at 07:00 UTC to 2019-10-06 at 21:00 UTC
 * Oanda data -> 1H candles
 */
const priceData: GenericCandle[] = candles
  .map(candle => ({
    time: new Date(candle.time),
    open: candle.open,
    close: candle.close,
    low: candle.low,
    high: candle.high,
    volume: candle.volume
  }))
  .sort((a, b) => b.time.valueOf() - a.time.valueOf());

export default priceData;
