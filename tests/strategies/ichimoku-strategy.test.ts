import { IchimokuStrategy } from "../../strategies/ichimoku-strategy";
import priceData from "../mock-data/candles";
import { Signal } from "../../strategies/signal";

// The data used for comparison is coming from TradingView using Oanda data
describe("Ichimoku strategy", () => {
  test("it should compute the Ichimoku values correctly", () => {
    const strategy = new IchimokuStrategy();
    // 2019-09-24 at 23:00 UTC
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 24 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 23
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const {
      ichimoku: { base, conversion, spanA, spanB },
      price
    } = result.data[1];
    expect(base).toBeCloseTo(1.1004, 4);
    expect(conversion).toBeCloseTo(1.10099, 4);
    expect(spanA).toBeCloseTo(1.09928, 4);
    expect(spanB).toBeCloseTo(1.10169, 4);
    expect(price).toBeCloseTo(1.10137, 4);
  });

  test("it should return a sell signal on September 25, 2019 at 12:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 12
    );

    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.Sell);
  });

  test("it should return a sell signal on September 16, 2019 at 15:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 16 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 15
    );

    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.Sell);
  });

  test("it should return a short exit signal on September 24 at 10:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 24 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 10
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.ShortExit);
  });

  test("it should return a buy signal on September 4 at 9:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 4 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 9
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.Buy);
  });

  test("it should return a strong buy signal on August 23 at 20:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 23 &&
        x.time.getUTCMonth() === 7 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 20
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.StrongBuy);
  });

  test("it should return a long exit signal on September 6 at 00:00 UTC", () => {
    const strategy = new IchimokuStrategy();
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 6 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 0
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    expect(result.signal).toBe(Signal.LongExit);
  });

  // No Strong Sell signal possible on the given period

  test("it should return the right stop loss price", () => {
    const strategy = new IchimokuStrategy();
    // 2019-09-25 at 12:00 UTC
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 12
    );
    const candles = priceData.slice(startIndex);
    strategy.getStrategy(candles);
    const stopLoss = strategy.getStopLossPrice();
    expect(stopLoss).toBe(1.1001);
  });

  test("it should return the right stop loss distance", () => {
    const strategy = new IchimokuStrategy();
    // 2019-09-25 at 12:00 UTC
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 12
    );
    const candles = priceData.slice(startIndex);
    strategy.getStrategy(candles);
    const stopLossDistance = strategy.getStopLossDistance(candles[0]);
    expect(stopLossDistance).toBeCloseTo(0.00148, 5);
  });

  test("it should throw an error when the candle array is too short (n < 200)", () => {
    const strategy = new IchimokuStrategy();
    const candles = priceData.slice(0, 199);
    expect(() => strategy.getStrategy(candles)).toThrow(
      new Error("candle array too short")
    );
  });
});
