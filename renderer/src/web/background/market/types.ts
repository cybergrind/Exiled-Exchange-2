// Shared shapes for the market modules. Everything in this directory is also
// run by plain Node (make update-prices, ./run): erasable syntax only, `import
// type` for types, relative imports with a .ts extension, no Vue and no `@/`.
// See guide/poe-source.html, D2 and D4.

export type QuoteCurrency = "exalted" | "chaos" | "divine";

/** One market in a GGG Currency Exchange hourly digest, as received. */
export interface CxMarket {
  league: string;
  market_id: string;
  market_pair: [string, string];
  volume_traded: Record<string, number>;
  lowest_stock: Record<string, number>;
  highest_stock: Record<string, number>;
  /** Not the lower price: min and max must be taken across both ratio fields. */
  lowest_ratio: Record<string, number>;
  highest_ratio: Record<string, number>;
}

/** GET web.poecdn.com/api/currency-exchange/poe2/<unix hour>, as received. */
export interface CxHour {
  next_change_id: number;
  markets: CxMarket[];
}

/** Rates are quote-currency units per one item. */
export interface PairStat {
  /** Quote units traded ÷ item units traded over the window. */
  typical: number;
  low: number;
  high: number;
  /** Item units traded over the window. */
  traded: number;
  /** Quote units traded over the window. */
  quoteTraded: number;
  /** Hours in the window with trades on this pair. */
  hours: number;
  /** Newest unix hour included. */
  asOfHour: number;
  /**
   * The newest hour with trades on this pair alone. Its low end is what
   * sellers got by filling buy orders (sell now); its average is a price a
   * listing filled at. Absent in snapshots written before it existed.
   */
  last?: LastHour;
}

export interface LastHour {
  hour: number;
  typical: number;
  low: number;
  high: number;
  traded: number;
}

export type ItemPairs = Partial<Record<QuoteCurrency, PairStat>>;

/** Keyed by GGG metadata id, e.g. Metadata/Items/Currency/CurrencyMagicQuality. */
export type PairTable = Record<string, ItemPairs>;
