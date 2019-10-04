import { ClientExtensions } from "./client-extensions";
import { TakeProfitOrder } from "./orders/take-profit-order";
import { StopLossOrder } from "./orders/stop-loss-order";
import { TrailingStopLossOrder } from "./orders/trailing-stop-loss-order";

export interface Trade {
  id: string;
  instrument: string;
  price: string;
  openTime: string;
  state: string;
  initialUnits: string;
  initialMarginRequired: string;
  currentUnits: string;
  realizedPL: string;
  unrealizedPL: string;
  marginUsed: string;
  averageClosePrice: string;
  closingTransactionIDs: string[];
  financing: string;
  closeTime: string;
  clientExtensions: ClientExtensions;
  takeProfitOrder: TakeProfitOrder;
  stopLossOrder: StopLossOrder;
  trailingStopLossOrder: TrailingStopLossOrder;
}
