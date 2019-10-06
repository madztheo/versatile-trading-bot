import { Signal } from "./signal";
import { GenericCandle } from "../generic-candle";

/**
 * Every strategy has to meet those requirements at least
 * so that they can be implemented easily within the broker
 * or exchange implementation
 */

export interface StrategyResponse {
  signal: Signal;
  data?: any; //The data is optional. You can pass whatever data you deem necessary for debugging purposes
}

export interface Strategy {
  /**
   * Get the signal and some extra data, if any, from the given
   * strategy. This is the only required function for a Strategy
   * interface to be valid.
   * @param priceData The array of GenericCandle to process to detect any potential signals
   */
  getStrategy(priceData: GenericCandle[]): StrategyResponse;
}
