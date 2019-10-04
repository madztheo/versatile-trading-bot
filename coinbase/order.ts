export interface Order {
  created_at: string;
  trade_id: number;
  product_id: string;
  order_id: string;
  user_id: string;
  profile_id: string;
  liquidity: string;
  price: string;
  size: string;
  fee: string;
  side: string;
  settled: boolean;
  usd_volume: string;
}
