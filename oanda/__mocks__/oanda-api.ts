import { Observable, Observer } from "rxjs";
import { AccountDetails } from "../interfaces/account-details";
import { CandleStickGranularity } from "../interfaces/candle/candle-stick-granularity";
import { Heartbeat } from "../interfaces/price/heartbeat";
import { Price } from "../interfaces/price/price";
import { CandleStick } from "../interfaces/candle/candle-stick";
import { Position } from "../interfaces/position";
import { Instrument } from "../interfaces/instrument";
import { AccountSummary } from "../interfaces/account-summary";
import { HomeConversions } from "../interfaces/home-conversions";
import {
  accountSummary,
  pricing,
  homeConversions,
  oandaCandles,
  position,
  instrumentDetails
} from "../../mock-data/oanda-data";

export class OandaAPI {
  realTrade: boolean;
  apiKey: string;
  accountID: string;
  pairTraded: string;

  constructor(apiKey, accountID, pairTraded, realTrade = true) {
    this.apiKey = apiKey;
    this.accountID = accountID;
    this.pairTraded = pairTraded;
    this.realTrade = realTrade;
  }

  async getAccountDetails(): Promise<AccountDetails> {
    return {} as any;
  }

  async getAccountSummary(): Promise<AccountSummary> {
    return accountSummary as any;
  }

  async getPrice(): Promise<Price> {
    return pricing as any;
  }

  async getConversionRates(): Promise<HomeConversions[]> {
    return homeConversions as any;
  }

  async getInstrumentDetails(): Promise<Instrument> {
    return instrumentDetails as any;
  }

  async getCandles(
    count: number,
    granularity: CandleStickGranularity,
    time?: Date
  ): Promise<CandleStick[]> {
    if (count === 0) {
      return [oandaCandles[0]];
    } else {
      return oandaCandles;
    }
  }

  async getOpenPosition(): Promise<Position> {
    return position as any;
  }

  closeLongPosition() {
    return true;
  }

  closeShortPosition() {
    return true;
  }

  private openOrder(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    return true;
  }

  async openLong(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    return this.openOrder(units, stopLossDistance, trailingStopLoss);
  }

  async openShort(
    units: number,
    stopLossDistance: string,
    trailingStopLoss = false
  ) {
    return this.openOrder(-1 * units, stopLossDistance, trailingStopLoss);
  }
}
