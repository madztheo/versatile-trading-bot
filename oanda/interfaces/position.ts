import { PositionSide } from "./position-side";

export interface Position {
  instrument: string;
  long: PositionSide;
  short: PositionSide;
  pl: string;
  resettablePL: string;
  financing: string;
  commission: string;
  guaranteedExecutionFees: string;
  unrealizedPL: string;
  marginUsed: string;
}
