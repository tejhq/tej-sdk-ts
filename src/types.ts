/**
 * Row shapes for tej-api responses. Field names are the API's snake_case
 * names, unchanged, so a row can be passed to a dataframe library or logged
 * without a mapping step. Dates are `YYYY-MM-DD` strings.
 */

export type Exchange = "nse" | "bse" | "NSE" | "BSE";
export type UniverseName = "liquid100" | "liquid250" | "liquid500";

export interface DateRange {
  /** Inclusive start, `YYYY-MM-DD`. Server default: `to` minus 90 days. */
  from?: string;
  /** Inclusive end, `YYYY-MM-DD`. Server default: today (UTC). */
  to?: string;
}

export interface OHLCV {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number;
  prev_close: number;
  volume: number;
  turnover: number;
  trades: number;
}

export interface SnapshotRow {
  symbol: string;
  series: string;
  isin: string;
  name: string;
  open: number;
  high: number;
  low: number;
  close: number;
  last: number;
  prev_close: number;
  volume: number;
  turnover: number;
  trades: number;
}

export type ActionType =
  | "dividend"
  | "split"
  | "bonus"
  | "rights"
  | "buyback"
  | "demerger"
  | "merger"
  | "agm"
  | "other";

export interface Action {
  exchange: string;
  symbol: string;
  isin: string;
  company: string;
  ex_date: string;
  record_date?: string;
  type: ActionType | string;
  ratio_num?: number;
  ratio_den?: number;
  cash_amount?: number;
  face_value_from?: number;
  face_value_to?: number;
  raw_subject: string;
}

export interface AdjustedRow {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  turnover: number;
  adj_factor_cumulative: number;
  adj_close: number;
}

export interface SymbolInterval {
  isin: string;
  symbol: string;
  valid_from: string;
  valid_to: string;
  trading_days: number;
}

/** Rolling fields are `null` until a full window of history exists. */
export interface MetricsRow {
  date: string;
  isin: string;
  adj_close: number;
  ret_1d: number | null;
  ret_5d: number | null;
  ret_21d: number | null;
  ret_63d: number | null;
  ret_126d: number | null;
  ret_252d: number | null;
  ret_ytd: number | null;
  high_52w: number | null;
  low_52w: number | null;
  pct_off_52w_high: number | null;
  pct_off_52w_low: number | null;
  avg_vol_20d: number | null;
  avg_vol_60d: number | null;
  avg_turnover_20d: number | null;
}

/** One instrument on one day with its metrics, from `/v1/screener`. */
export interface ScreenerRow extends MetricsRow {
  symbol: string;
}

export type ScreenerColumn =
  | "adj_close"
  | "ret_1d" | "ret_5d" | "ret_21d" | "ret_63d" | "ret_126d" | "ret_252d" | "ret_ytd"
  | "high_52w" | "low_52w" | "pct_off_52w_high" | "pct_off_52w_low"
  | "avg_vol_20d" | "avg_vol_60d" | "avg_turnover_20d";

export type ScreenerOp = "gt" | "gte" | "lt" | "lte";

export interface ScreenerOptions {
  /** `nse` (default) or `bse`. */
  exchange?: string;
  /** Trading day, `YYYY-MM-DD`. Defaults to today; snaps back to the latest trading day on or before it. */
  date?: string;
  /** Restrict to the point-in-time liquidN membership in force on that day. */
  universe?: UniverseName;
  /** `{ "ret_21d.gt": 0.05, "pct_off_52w_high.gte": -0.05 }`. At most ten, all ANDed. */
  filters?: Partial<Record<`${ScreenerColumn}.${ScreenerOp}`, number>>;
  /** A metrics column or `symbol`. Numeric sorts default to `desc`, nulls last. */
  sort?: ScreenerColumn | "symbol";
  order?: "asc" | "desc";
  /** 1 to 500, default 50. */
  limit?: number;
  offset?: number;
}

export interface ScreenerMeta {
  exchange: string;
  /** Trading day actually used. */
  date: string;
  /** Date requested. */
  as_of: string;
  universe: string;
  filters: string[];
  sort: string;
  order: string;
  limit: number;
  offset: number;
  /** Rows in this page. */
  count: number;
  /** Matches before paging. */
  total: number;
}

export interface UniverseMember {
  rank: number;
  symbol: string;
  isin: string;
  name: string;
  avg_turnover_63d: number;
}

export type MatchedOn = "symbol" | "former_symbol" | "name" | "symbol_prefix" | "name_prefix" | "fuzzy";

export interface ResolveHit {
  exchange: string;
  symbol: string;
  isin: string;
  name: string;
  score: number;
  matched_on: MatchedOn | string;
  former_symbols?: string[];
}

export interface KeyInfo {
  id: string;
  prefix: string;
  tier: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface Me {
  email: string;
  tier: string;
  usage_today: { used: number; limit: number; per_minute: number };
  keys: KeyInfo[];
}

export interface Envelope<T> {
  data: T;
  meta?: Record<string, unknown>;
}
