import { Heartbeat as CoinbaseHeartbeat } from "./coinbase/heartbeat";
import { GenericCandle } from "./generic-candle";
import { Ticker } from "./coinbase/ticker";
import { Price } from "./oanda/interfaces/price/price";
import { Heartbeat as OandaHeartbeat } from "./oanda/interfaces/price/heartbeat";

export class CandleGenerator {
  period: number;
  currentCandleDate: Date;
  nextCandleDate: Date;
  latestPrice: number;

  constructor(priceData: GenericCandle[], period = 15) {
    this.period = period;
    this.currentCandleDate = new Date(priceData[0].time);
    this.nextCandleDate = new Date(this.currentCandleDate);
    this.nextCandleDate.setSeconds(
      this.nextCandleDate.getSeconds() + period * 60
    );
    this.latestPrice = priceData[0].close;
  }

  private roundTo5Decimals(num: number) {
    return Math.round(num * 100000) / 100000;
  }

  private getMidPrice(bid: number, ask: number) {
    return this.roundTo5Decimals((bid + ask) / 2);
  }

  private getCandle(
    ticker: {
      type: "ticker" | "heartbeat";
      time: Date;
      price: number;
      volume: number;
    },
    priceData: GenericCandle[]
  ) {
    let update = false;
    if (ticker.type === "ticker") {
      update = true;
      if (ticker.time > this.nextCandleDate) {
        //We add a new candle
        priceData.unshift({
          time: new Date(this.nextCandleDate),
          low: ticker.price,
          high: ticker.price,
          open: ticker.price,
          close: ticker.price,
          volume: ticker.volume
        });
        this.currentCandleDate = new Date(this.nextCandleDate);
        this.nextCandleDate = new Date(this.currentCandleDate);
        this.nextCandleDate.setSeconds(
          this.nextCandleDate.getSeconds() + this.period * 60
        );
        //We don't want it to get too big
        if (priceData.length > 10000) {
          priceData.pop();
        }
      } else {
        // [[ time, low, high, open, close, volume ] * n] (e.g LHOC)
        /**
         * Note that if the volume is zero, we update the candle as if it started with
         * this trade considering that is the first of the frame in this case.
         * If no trades are completed in the frame, the candle will have the same price as
         * the last trade price in the previous frames
         */
        //Low
        if (ticker.price < priceData[0].low || priceData[0].volume === 0) {
          priceData[0].low = ticker.price;
        }
        //High
        if (ticker.price > priceData[0].high || priceData[0].volume === 0) {
          priceData[0].high = ticker.price;
        }
        //Open
        if (priceData[0].volume === 0) {
          priceData[0].open = ticker.price;
        }
        //Close
        priceData[0].close = ticker.price;
        priceData[0].volume += ticker.volume;
      }
      this.latestPrice = ticker.price;
    } else if (ticker.type === "heartbeat") {
      if (ticker.time > this.nextCandleDate) {
        update = true;
        //We add a new candle
        priceData.unshift({
          time: new Date(this.nextCandleDate),
          low: this.latestPrice,
          high: this.latestPrice,
          open: this.latestPrice,
          close: this.latestPrice,
          volume: 0
        });
        this.currentCandleDate = new Date(this.nextCandleDate);
        this.nextCandleDate = new Date(this.currentCandleDate);
        this.nextCandleDate.setSeconds(
          this.nextCandleDate.getSeconds() + this.period * 60
        );
        //We don't want it to get too big
        if (priceData.length > 10000) {
          priceData.pop();
        }
      }
    }
    return {
      priceData: priceData,
      update: update
    };
  }

  getCoinbaseCandle(
    data: Ticker | CoinbaseHeartbeat,
    priceData: GenericCandle[]
  ) {
    if ((data.type === "ticker" && data.time) || data.type === "heartbeat") {
      return this.getCandle(
        {
          time: new Date(data.time),
          type: data.type,
          price: data.type === "ticker" ? parseFloat(data.price) : 0,
          volume:
            data.type === "ticker" && data.last_size
              ? parseFloat(data.last_size)
              : 0
        },
        priceData
      );
    }
    return {
      priceData: priceData,
      update: true
    };
  }

  getOandaCandle(data: Price | OandaHeartbeat, priceData: GenericCandle[]) {
    if (
      (data.type === "PRICE" &&
        data.bids &&
        data.bids.length > 0 &&
        data.asks &&
        data.asks.length > 0) ||
      data.type === "HEARTBEAT"
    ) {
      return this.getCandle(
        {
          time: new Date(data.time),
          type: data.type === "HEARTBEAT" ? "heartbeat" : "ticker",
          price:
            data.type === "PRICE"
              ? this.getMidPrice(
                  parseFloat(data.bids[0].price),
                  parseFloat(data.asks[0].price)
                )
              : 0,
          //We don't want to count empty candles
          volume: data.type === "HEARTBEAT" ? 0 : 1
        },
        priceData
      );
    }
    return {
      priceData: priceData,
      update: true
    };
  }
}
