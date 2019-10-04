import { ClientExtensions } from "../client-extensions";

export interface Order {
  id: string;
  createTime: string;
  state: "PENDING" | "FILLED" | "TRIGGERED" | "CANCELLED";
  clientExtensions: ClientExtensions;
}
