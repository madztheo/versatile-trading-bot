import { SimpleSMAStrategy } from "../../strategies/simple-sma-strategy";
import priceData from "../../mock-data/candles";
import { Signal } from "../../strategies/signal";

// The data used for comparison is coming from TradingView using Oanda data
describe("Simple SMA strategy", () => {
  test("it should compute the Simple Moving Average values correctly", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
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
    const { shortMA, longMA, baseMA } = result.data[1];
    expect(shortMA).toBeCloseTo(1.10134, 4);
    expect(longMA).toBeCloseTo(1.10039, 4);
    expect(baseMA).toBeCloseTo(1.10006, 4);
  });

  test("it should return a strong buy signal on October 2, 2019 at 00:00 UTC", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 0
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.StrongBuy);
  });

  test("it should not return a strong buy signal twice in a row", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 0
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.StrongBuy);

    const { signal: secondSignal } = strategy.getStrategy(candles);
    expect(secondSignal).toBe(Signal.Nothing);
  });

  test("it should return a buy signal on October 2, 2019 at 17:00 UTC", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 17
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.Buy);
  });

  test("it should not return a buy signal twice in a row", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 17
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.Buy);

    const { signal: secondSignal } = strategy.getStrategy(candles);
    expect(secondSignal).toBe(Signal.Nothing);
  });

  test("it should return a sell signal on October 2, 2019 at 09:00 UTC", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 9
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.Sell);
  });

  test("it should not return a sell signal twice in a row", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 2 &&
        x.time.getUTCMonth() === 9 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 9
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.Sell);

    const { signal: secondSignal } = strategy.getStrategy(candles);
    expect(secondSignal).toBe(Signal.Nothing);
  });

  test("it should return a strong sell signal on September 25, 2019 at 16:00 UTC", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 16
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.StrongSell);
  });

  test("it should not return a strong sell signal twice in a row", () => {
    const strategy = new SimpleSMAStrategy(10, 20, 50);
    const startIndex = priceData.findIndex(
      x =>
        x.time.getUTCDate() == 25 &&
        x.time.getUTCMonth() === 8 &&
        x.time.getUTCFullYear() === 2019 &&
        x.time.getUTCHours() === 16
    );
    const candles = priceData.slice(startIndex);
    const result = strategy.getStrategy(candles);
    const { signal } = result;
    expect(signal).toBe(Signal.StrongSell);

    const { signal: secondSignal } = strategy.getStrategy(candles);
    expect(secondSignal).toBe(Signal.Nothing);
  });
});
