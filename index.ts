import express from "express";
import { OandaTrader } from "./oanda/oanda-trader";
import { CoinbaseTrader } from "./coinbase/coinbase-trader";
import { OandaBacktracking } from "./oanda/oanda-backtracking";
import dotenv from "dotenv";
dotenv.config();
const app = express();

const PORT = process.env.PORT || 3000;
const currentStrategy = process.env.STRATEGY || "Ichimoku";
const forexPeriod = parseFloat(process.env.FOREX_PERIOD) || 60;
const forexTestPeriod = parseFloat(process.env.FOREX_TEST_PERIOD) || 240;
const instrumentsTraded =
  process.env.FOREX_INSTRUMENTS || "EUR_USD,AUD_USD,USD_JPY";
let forexRealTrading = false;
if (process.env.REAL_FOREX) {
  forexRealTrading = process.env.REAL_FOREX == "1";
}

app.get("/backtracking", (req, res) => {
  const instruments = instrumentsTraded.split(",");
  for (let instrument of instruments) {
    const oandaTrader = new OandaBacktracking(
      currentStrategy,
      forexPeriod,
      instrument,
      instruments.length
    );
    oandaTrader.startBacktracking();
  }
  res.send("Backtracking started");
});

app.listen(PORT, () => {
  console.log(`Trading bot listening on port ${PORT}`);

  //Crypto
  const coinbaseTrader = new CoinbaseTrader(false);
  coinbaseTrader.start();

  //Forex
  const instruments = instrumentsTraded.split(",");

  /**
   * Along with real trades we also deal with practice
   * trades. That way we can test the strategy
   * for a different period at the same time.
   */
  for (let instrument of instruments) {
    const oandaTrader = new OandaTrader(
      currentStrategy,
      forexTestPeriod,
      instrument,
      false,
      instruments.length
    );
    oandaTrader.start();
  }

  if (forexRealTrading) {
    //Real trading
    for (let instrument of instruments) {
      const oandaTrader = new OandaTrader(
        currentStrategy,
        forexPeriod,
        instrument,
        true,
        instruments.length
      );
      oandaTrader.start();
    }
  }
});
