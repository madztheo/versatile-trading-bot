import priceData from "../../mock-data/candles";
import { Signal } from "../../strategies/signal";
import { IchimokuStrategy } from "../../strategies/ichimoku-strategy";
import { OandaTrader } from "../../oanda/oanda-trader";
import {
  accountSummary,
  instrumentDetails,
  position
} from "../../mock-data/oanda-data";
import { OandaAPI } from "../../oanda/oanda-api";

jest.mock("../../oanda/oanda-api");

describe("Oanda trader", () => {
  let oandaTrader: OandaTrader;
  const openLongSpy = jest.spyOn(OandaAPI.prototype, "openLong");
  const openShortSpy = jest.spyOn(OandaAPI.prototype, "openShort");
  const closeLongSpy = jest.spyOn(OandaAPI.prototype, "closeLongPosition");
  const closeShortSpy = jest.spyOn(OandaAPI.prototype, "closeShortPosition");
  const getOpenPositionSpy = jest.spyOn(OandaAPI.prototype, "getOpenPosition");
  const getCandlesSpy = jest.spyOn(OandaAPI.prototype, "getCandles");
  const getPriceSpy = jest.spyOn(OandaAPI.prototype, "getPrice");
  const callStrategySpy = jest.spyOn(OandaTrader.prototype, "callStrategy");

  beforeEach(async () => {
    oandaTrader = new OandaTrader("Ichimoku", 60, "EUR_USD", true, 1);
    oandaTrader.canTrade = true;
    await oandaTrader.start();

    openLongSpy.mockClear();
    openShortSpy.mockClear();
    closeLongSpy.mockClear();
    closeShortSpy.mockClear();
    getOpenPositionSpy.mockClear();
    getCandlesSpy.mockClear();
    getPriceSpy.mockClear();
    callStrategySpy.mockClear();
  });

  afterEach(() => {
    oandaTrader.stop();
  });

  test("it should have the correct initial values", () => {
    expect(oandaTrader.currentStrategy).toBe("Ichimoku");
    expect(oandaTrader.accountSummary).toBe(accountSummary);
    expect(oandaTrader.instrumentDetails).toBe(instrumentDetails);
    expect(oandaTrader.strategy).toBeInstanceOf(IchimokuStrategy);
    expect(oandaTrader.priceData).toStrictEqual(priceData);
    expect(oandaTrader.nbOfPairsTraded).toBe(1);
    expect(oandaTrader.oandaAPI).toBeDefined();
    expect(oandaTrader.period).toBe(60);
    expect(oandaTrader.realTrade).toBe(true);
  });

  test("it should return the right period", () => {
    expect(oandaTrader.getStringPeriod()).toBe("H1");

    oandaTrader = new OandaTrader("Ichimoku", 15, "EUR_USD", true, 1);
    expect(oandaTrader.getStringPeriod()).toBe("M15");
  });

  test("it should return the right spread", () => {
    // EUR/USD pip location is -4 so it's like doing 11222 - 11200
    expect(oandaTrader.getSpread(1.12, 1.1222)).toBeCloseTo(22);

    // We make as if we were trading the USD/JPY pair whose pip location is -2
    const tempPipLocation = instrumentDetails.pipLocation;
    instrumentDetails.pipLocation = -2;
    expect(oandaTrader.getSpread(111.11, 111.14)).toBeCloseTo(3);
    instrumentDetails.pipLocation = tempPipLocation;
  });

  test("it should return the right allocable funds", async () => {
    const balance = parseFloat(accountSummary.balance);
    // One third for a regular position
    expect(oandaTrader.getAllocableFunds()).toBeCloseTo(balance / 3);
    // Two third for a big position
    expect(oandaTrader.getAllocableFunds(true)).toBeCloseTo((balance / 3) * 2);

    oandaTrader.stop();
    // We make as if we were trading two currency pairs
    oandaTrader = new OandaTrader("Ichimoku", 60, "EUR_USD", true, 2);
    await oandaTrader.start();
    // One third of half the funds
    expect(oandaTrader.getAllocableFunds()).toBeCloseTo(balance / 2 / 3);
    // Two thid of half the funds
    expect(oandaTrader.getAllocableFunds(true)).toBeCloseTo(
      (balance / 2 / 3) * 2
    );
  });

  test("it should detect an incoming margin call correctly", () => {
    expect(oandaTrader.canPlaceEntryOrder()).toBe(true);

    // Slighlty above the threshold meaning we're too close from a margin call
    const tempMarginCallPercent = accountSummary.marginCallPercent;
    accountSummary.marginCallPercent = "0.91";
    expect(oandaTrader.canPlaceEntryOrder()).toBe(false);
    accountSummary.marginCallPercent = tempMarginCallPercent;
  });

  test("it should detect wide spread properly", async () => {
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.1225)).toBe(true);
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.1226)).toBe(false);

    oandaTrader.stop();
    oandaTrader = new OandaTrader("Ichimoku", 15, "EUR_USD", true, 1);
    await oandaTrader.start();
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.1223)).toBe(true);
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.1224)).toBe(false);

    oandaTrader.stop();
    oandaTrader = new OandaTrader("Ichimoku", 240, "EUR_USD", true, 1);
    await oandaTrader.start();
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.123)).toBe(true);
    expect(oandaTrader.isSpreadSmallEnough(1.122, 1.1231)).toBe(false);
  });

  test("it should return the right amount of allocable units", async () => {
    const marginRate = parseFloat(instrumentDetails.marginRate);
    const balance = parseFloat(accountSummary.balance);
    expect.assertions(2);
    await expect(oandaTrader.getAllocableUnits()).resolves.toBe(
      Math.floor(balance / 3 / marginRate)
    );
    await expect(oandaTrader.getAllocableUnits(true)).resolves.toBe(
      Math.floor(((balance / 3) * 2) / marginRate)
    );
  });

  test("it should detect if too much fund has been invested", async () => {
    const balance = parseFloat(accountSummary.balance);
    const maxUnits = await oandaTrader.getUnits(balance);
    expect.assertions(5);
    /**
     * The maximum amount of units have been allocated and adding
     * even one more should not be possible
     * */
    await expect(oandaTrader.hasReachFundsLimit(1, maxUnits)).resolves.toBe(
      true
    );

    /**
     * One unit has been allocated (rather unlikely in practice)
     * Adding the maximum amount of units possible should not be possible
     */
    await expect(oandaTrader.hasReachFundsLimit(maxUnits, 1)).resolves.toBe(
      true
    );

    /**
     * One unit has been allocated (rather unlikely in practice)
     * Adding the maximum amount of units minus 1 should be possible
     */
    await expect(oandaTrader.hasReachFundsLimit(maxUnits - 1, 1)).resolves.toBe(
      false
    );

    /**
     * One third of the funds (i.e. a small trade) has already been allocated
     * and we should be able to add two thirds of the funds (i.e. a big trade).
     * Not that it cannot be the same position (i.e. long and long) but it can be
     * an opposite position on the same instrument (i.e. long and short)
     */
    await expect(
      oandaTrader.hasReachFundsLimit((maxUnits / 3) * 2, maxUnits / 3)
    ).resolves.toBe(false);

    /**
     * Same thing as before but there is one more unit than possible
     */
    await expect(
      oandaTrader.hasReachFundsLimit((maxUnits / 3) * 2 + 1, maxUnits / 3)
    ).resolves.toBe(true);
  });

  test("it should throw an error when opening two long positions on the same instrument", async () => {
    const tempLongUnits = position.long.units;
    expect.assertions(1);
    position.long.units = "100";
    await expect(oandaTrader.openLong(false, 1.12, 1.1222)).rejects.toEqual(
      new Error("A similar position is already opened")
    );
    position.long.units = tempLongUnits;
  });

  test("it should throw an error when the spread is too wide while trying to open a long position", async () => {
    const tempLongUnits = position.long.units;
    position.long.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openLong(false, 1.12, 1.13)).rejects.toEqual(
      new Error("The spread is too wide for now")
    );
    position.long.units = tempLongUnits;
  });

  test("it should throw an error when too close from a margin call while trying to open a long position", async () => {
    const tempLongUnits = position.long.units;
    const tempMarginCallPercent = accountSummary.marginCallPercent;
    accountSummary.marginCallPercent = "0.91";
    position.long.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openLong(false, 1.12, 1.1202)).rejects.toEqual(
      new Error("Too close from margin call")
    );
    position.long.units = tempLongUnits;
    accountSummary.marginCallPercent = tempMarginCallPercent;
  });

  test("it should throw an error when too much funds have been invested while trying to open a long position", async () => {
    const balance = parseFloat(accountSummary.balance);
    const maxUnits = await oandaTrader.getUnits(balance);
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = `-${maxUnits}`;
    position.long.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openLong(false, 1.12, 1.1202)).rejects.toEqual(
      new Error("Too much fund invested")
    );
    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should open a long position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openLong(false, 1.12, 1.1202)).resolves.toBe(true);
    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should throw an error when opening two short positions on the same instrument", async () => {
    const tempShortUnits = position.short.units;
    expect.assertions(1);
    position.short.units = "-100";
    await expect(oandaTrader.openShort(false, 1.12, 1.1222)).rejects.toEqual(
      new Error("A similar position is already opened")
    );
    position.short.units = tempShortUnits;
  });

  test("it should throw an error when the spread is too wide while trying to open a short position", async () => {
    const tempShortUnits = position.short.units;
    position.short.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openShort(false, 1.12, 1.13)).rejects.toEqual(
      new Error("The spread is too wide for now")
    );
    position.short.units = tempShortUnits;
  });

  test("it should throw an error when too close from a margin call while trying to short a long position", async () => {
    const tempShortUnits = position.short.units;
    const tempMarginCallPercent = accountSummary.marginCallPercent;
    accountSummary.marginCallPercent = "0.91";
    position.short.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openShort(false, 1.12, 1.1202)).rejects.toEqual(
      new Error("Too close from margin call")
    );
    position.short.units = tempShortUnits;
    accountSummary.marginCallPercent = tempMarginCallPercent;
  });

  test("it should throw an error when too much funds have been invested while trying to open a short position", async () => {
    const balance = parseFloat(accountSummary.balance);
    const maxUnits = await oandaTrader.getUnits(balance);
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = maxUnits.toString();
    expect.assertions(1);
    await expect(oandaTrader.openShort(false, 1.12, 1.1202)).rejects.toEqual(
      new Error("Too much fund invested")
    );
    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should open a short position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "0";
    expect.assertions(1);
    await expect(oandaTrader.openShort(false, 1.12, 1.1202)).resolves.toBe(
      true
    );
    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should trigger a call to open a long position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "0";

    await expect(
      oandaTrader.analyseSignal(Signal.Buy, 1.12, 1.1202)
    ).resolves.toBe(true);
    expect(openLongSpy).toHaveBeenCalledTimes(1);

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should trigger a call to open a short position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "0";

    await expect(
      oandaTrader.analyseSignal(Signal.Sell, 1.12, 1.1202)
    ).resolves.toBe(true);
    expect(openShortSpy).toHaveBeenCalledTimes(1);

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should trigger a call to close the long position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "100";

    await expect(
      oandaTrader.analyseSignal(Signal.LongExit, 1.12, 1.1202)
    ).resolves.toBe(true);
    expect(closeLongSpy).toHaveBeenCalledTimes(1);

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should trigger a call to close the short position", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "-100";
    position.long.units = "0";

    await expect(
      oandaTrader.analyseSignal(Signal.ShortExit, 1.12, 1.1202)
    ).resolves.toBe(true);
    expect(closeShortSpy).toHaveBeenCalledTimes(1);

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should not trigger any order", async () => {
    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "0";
    position.long.units = "0";

    await expect(
      oandaTrader.analyseSignal(Signal.Nothing, 1.12, 1.1202)
    ).resolves.toBe(false);

    expect(openLongSpy).not.toHaveBeenCalled();
    expect(openShortSpy).not.toHaveBeenCalled();
    expect(closeLongSpy).not.toHaveBeenCalled();
    expect(closeShortSpy).not.toHaveBeenCalled();

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should close positions 5 minutes before Forex close", async () => {
    const currentDate = new Date(Date.UTC(2019, 9, 11, 20, 55));
    oandaTrader = new OandaTrader("Ichimoku", 15, "EUR_USD", true, 1);
    await oandaTrader.start();

    const tempShortUnits = position.short.units;
    const tempLongUnits = position.long.units;
    position.short.units = "-100";
    position.long.units = "100";

    await oandaTrader.fetchNewData(currentDate);
    expect(getOpenPositionSpy).toHaveBeenCalledTimes(1);
    expect(closeShortSpy).toHaveBeenCalledTimes(1);
    expect(closeLongSpy).toHaveBeenCalledTimes(1);

    position.short.units = tempShortUnits;
    position.long.units = tempLongUnits;
  });

  test("it should return prematurely when it's the weekend", async () => {
    const currentDate = new Date(Date.UTC(2019, 9, 12, 12, 0));
    await expect(oandaTrader.fetchNewData(currentDate)).resolves.toBe(false);
    expect(getCandlesSpy).not.toHaveBeenCalled();
    expect(getPriceSpy).not.toHaveBeenCalled();
    expect(callStrategySpy).not.toHaveBeenCalled();
  });

  test("it should trigger a call to the strategy", async () => {
    const currentDate = new Date(Date.UTC(2019, 9, 9, 12, 0));
    await oandaTrader.fetchNewData(currentDate);
    expect(getCandlesSpy).toHaveBeenCalledTimes(1);
    expect(getPriceSpy).toHaveBeenCalledTimes(1);
    expect(callStrategySpy).toHaveBeenCalledTimes(1);
  });
});
