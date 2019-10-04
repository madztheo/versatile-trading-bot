import { CandleStickData } from "./candle-data";

export interface CandleStick {
  time: string;
  bid: CandleStickData;
  mid: CandleStickData;
  ask: CandleStickData;
  complete: boolean;
  volume: number;
}
