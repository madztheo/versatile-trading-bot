export interface Price {
  type: "PRICE";
  instrument: string;
  time: string;
  tradeable: boolean;
  bids: {
    price: string;
    liquity: number;
  }[];
  asks: {
    price: string;
    liquity: number;
  }[];
  closeoutBid: string;
  closeoutAsk: string;
}
