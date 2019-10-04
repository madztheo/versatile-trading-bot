export interface Instrument {
  name: string;
  type: "CURRENCY" | "CFD" | "METAL";
  displayName: string;
  pipLocation: number;
  displayPrecision: number;
  tradeUnitsPrecision: number;
  minimumTradeSize: string;
  maximumTrailingStopDistance: string;
  minimumTrailingStopDistance: string;
  maximumPositionSize: string;
  maximumOrderUnits: string;
  marginRate: string;
}
