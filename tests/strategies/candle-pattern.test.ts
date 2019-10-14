import { CandlePattern } from "../../strategies/candle-pattern";
import priceData from "../../mock-data/candles";
import { Signal } from "../../strategies/signal";

// The data used for comparison is coming from TradingView using Oanda data
describe("Candle pattern", () => {
  test("it should return a long exit signal on September 25, 2019 at 17:00 UTC", () => {
    const pattern = new CandlePattern();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 17
    );
    const candles = priceData.slice(startIndex);
    const signal = pattern.detectCandleSignal(candles);
    expect(signal).toBe(Signal.LongExit);
  });

  test("it should return a short exit signal on October 1, 2019 at 17:00 UTC", () => {
    const pattern = new CandlePattern();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 1 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 17
    );
    const candles = priceData.slice(startIndex);
    const signal = pattern.detectCandleSignal(candles);
    expect(signal).toBe(Signal.ShortExit);
  });
});
