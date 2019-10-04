import { Order } from "./order";

export interface TakeProfitOrder extends Order {
  type: "TAKE_PROFIT";
  tradeID: string;
  clientTradeID: string;
  price: string;
  timeInForce: "GTC" | "GFD" | "GTD";
  gtdTime: string;
  triggerCondition: "DEFAULT" | "INVERSE" | "BID" | "ASK" | "MID";
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
