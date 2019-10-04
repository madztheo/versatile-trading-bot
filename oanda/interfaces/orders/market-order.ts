import { Order } from "./order";
import { ClientExtensions } from "../client-extensions";

export interface MarketOrder extends Order {
  type: "MARKET";
  instrument: string;
  units: string;
  timeInForce: "FOK" | "IOC";
  priceBound: string;
  positionFill: "OPEN_ONLY" | "REDUCE_FIRST" | "REDUCE_ONLY" | "DEFAULT";
  tradeClose: {
    tradeID: string;
    clientTradeID: string;
    units: string;
  };
  longPositionCloseout: {
    instrument: string;
    units: string;
  };
  shortPositionCloseout: {
    instrument: string;
    units: string;
  };
  marginCloseout: {
    instrument: string;
    units: string;
  };
  delayedTradeClose: {
    tradeID: string;
    clientTradeID: string;
    sourceTransactionID: string;
  };
  takeProfitOnFill: {
    price: string;
    timeInForce: "GTC" | "GTD" | "GFD";
    gtdTime: string;
    clientExtensions: ClientExtensions;
  };
  stopLossOnFill: {
    price: string;
    distance: string;
    timeInForce: "GTC" | "GTD" | "GFD";
    gtdTime: string;
    clientExtensions: ClientExtensions;
    guaranteed: boolean;
  };
  trailingStopLossOnFill: {
    distance: string;
    timeInForce: "GTC" | "GTD" | "GFD";
    gtdTime: string;
    clientExtensions: ClientExtensions;
  };
  tradeClientExtensions: ClientExtensions;
  fillingTransactionID: string;
  filledTime: string;
  tradeOpenedID: string;
  tradeReducedID: string;
  tradeClosedIDs: string[];
  cancellingTransactionID: string;
  cancelledTime: string;
}
