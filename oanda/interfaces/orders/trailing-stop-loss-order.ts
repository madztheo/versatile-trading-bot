import { Order } from "./order";

export interface TrailingStopLossOrder extends Order {
  type: "TRAILING_STOP_LOSS";
  guaranteedExecutionPremium: string;
  tradeID: string;
  clientTradeID: string;
  distance: string;
  timeInForce: "GTC" | "GFD" | "GTD";
  gtdTime: string;
  triggerCondition: "DEFAULT" | "INVERSE" | "BID" | "ASK" | "MID";
  guaranteed: boolean;
  fillingTransactionID: string;
  filledTime: string;
  tradeOpenedID: string;
  tradeReducedID: string;
  tradeClosedIDs: string[];
  cancellingTransactionID: string;
  cancelledTime: string;
  replacesOrderID: string;
  replacedByOrderID: string;
}
