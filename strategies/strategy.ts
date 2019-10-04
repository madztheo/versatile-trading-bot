import { Signal } from "./signal";
import { GenericCandle } from "../generic-candle";

export interface StrategyResponse {
  signal: Signal;
  data?: any;
}

export interface Strategy {
  getStrategy(priceData: GenericCandle[]): StrategyResponse;
}
