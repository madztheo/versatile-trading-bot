export const accountSummary = {
  NAV: "43650.78835",
  alias: "My New Account #2",
  balance: "43650.78835",
  createdByUserID: 9381808,
  createdTime: "2015-08-12T18:21:00.697504698Z",
  currency: "CHF",
  hedgingEnabled: false,
  id: "101-004-9381808-001",
  lastTransactionID: "6356",
  marginAvailable: "43650.78835",
  marginCloseoutMarginUsed: "0.00000",
  marginCloseoutNAV: "43650.78835",
  marginCloseoutPercent: "0.00000",
  marginCloseoutPositionValue: "0.00000",
  marginCloseoutUnrealizedPL: "0.00000",
  marginRate: "0.02",
  marginUsed: "0.00000",
  openPositionCount: 0,
  openTradeCount: 0,
  pendingOrderCount: 0,
  pl: "-56034.41199",
  positionValue: "0.00000",
  resettablePL: "-56034.41199",
  unrealizedPL: "0.00000",
  withdrawalLimit: "43650.78835",
  marginCallPercent: "0.4"
};

export const pricing = {
  asks: [
    {
      liquidity: 10000000,
      price: "1.13028"
    },
    {
      liquidity: 10000000,
      price: "1.13030"
    }
  ],
  bids: [
    {
      liquidity: 10000000,
      price: "1.13015"
    },
    {
      liquidity: 10000000,
      price: "1.13013"
    }
  ],
  closeoutAsk: "1.13032",
  closeoutBid: "1.13011",
  instrument: "EUR_USD",
  quoteHomeConversionFactors: {
    negativeUnits: "0.95904000",
    positiveUnits: "0.95886000"
  },
  status: "tradeable",
  time: "2016-06-22T18:41:36.201836422Z",
  unitsAvailable: {
    default: {
      long: "2013434",
      short: "2014044"
    },
    openOnly: {
      long: "2013434",
      short: "2014044"
    },
    reduceFirst: {
      long: "2013434",
      short: "2014044"
    },
    reduceOnly: {
      long: "0",
      short: "0"
    }
  }
};

export const homeConversions = [];

export const instrumentDetails = {
  displayName: "EUR/USD",
  displayPrecision: 5,
  marginRate: "0.02",
  maximumOrderUnits: "100000000",
  maximumPositionSize: "0",
  maximumTrailingStopDistance: "1.00000",
  minimumTradeSize: "1",
  minimumTrailingStopDistance: "0.00050",
  name: "EUR_USD",
  pipLocation: -4,
  tradeUnitsPrecision: 0,
  type: "CURRENCY"
};

export const position = {
  instrument: "EUR_USD",
  long: {
    averagePrice: "1.13032",
    pl: "-54344.85056",
    resettablePL: "-54344.85056",
    tradeIDs: ["6383", "6385"],
    units: "350",
    unrealizedPL: "-0.04700"
  },
  pl: "-54300.44169",
  resettablePL: "-54300.44169",
  short: {
    pl: "44.40887",
    resettablePL: "44.40887",
    units: "0",
    unrealizedPL: "0.00000"
  },
  unrealizedPL: "-0.04700"
};

export const oandaCandles = require("./oanda-candles.json");
