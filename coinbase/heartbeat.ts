export interface Heartbeat {
  type: "heartbeat";
  sequence: number;
  product_id: string;
  time: string;
  last_trade_id: number;
}
