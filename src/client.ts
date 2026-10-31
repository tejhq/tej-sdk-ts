import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_RETRIES,
  DEFAULT_TIMEOUT_MS,
  USER_AGENT,
  buildUrl,
  envelopeData,
  isRecord,
  normalizeExchange,
  normalizeSymbol,
  requestJson,
  validateDate,
  type FetchLike,
  type Query,
  type Sleep,
} from "./http.js";
import { ValidationError } from "./errors.js";
import type {
  Action,
  AdjustedRow,
  DeliveryRow,
  DateRange,
  Envelope,
  Me,
  MetricsRow,
  OHLCV,
  ResolveHit,
  ScreenerMeta,
  ScreenerOptions,
  ScreenerRow,
  SnapshotRow,
  SymbolInterval,
  UniverseMember,
  UniverseName,
} from "./types.js";

export interface ClientOptions {
  /** API base URL. Defaults to https://api.tejhq.dev. */
  baseUrl?: string;
  /** `tej_live_...` key, sent as `Authorization: Bearer`. Not needed for ohlcv, snapshot, actions. */
  apiKey?: string;
  /** Per-request timeout. Default 30000. */
  timeoutMs?: number;
  /** Retries on 429, 5xx and network errors with exponential backoff. Default 3. */
  maxRetries?: number;
  /** Appended to the User-Agent for attribution. */
  userAgentSuffix?: string;
  /** Extra headers merged into every request. */
  defaultHeaders?: Record<string, string>;
  /** Custom fetch, for tests or a non-global implementation. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
  /** Custom sleep between retries, for tests. */
  sleep?: Sleep;
}

/**
 * Client for tej-api. Every method returns a promise of plain row objects
 * with the API's snake_case field names.
 *
 * ```ts
 * const c = new Client();
 * const rows = await c.ohlcv("RELIANCE", "nse", { from: "2025-01-01", to: "2025-01-31" });
 * ```
 */
export class Client {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: Sleep | undefined;

  constructor(opts: ClientOptions = {}) {
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
    const headers: Record<string, string> = { ...(opts.defaultHeaders ?? {}) };
    if (opts.apiKey) headers["Authorization"] = `Bearer ${opts.apiKey}`;
    if (opts.userAgentSuffix) headers["User-Agent"] = `${USER_AGENT} ${opts.userAgentSuffix}`;
    this.headers = headers;
    const f = opts.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!f) throw new ValidationError("no fetch available: pass { fetch } or run on Node 18+ / a modern browser");
    this.fetchImpl = f;
    this.sleep = opts.sleep;
  }

  private async get(path: string, query?: Query): Promise<unknown> {
    const url = buildUrl(this.baseUrl, path, query);
    const res = await requestJson(url, {
      fetch: this.fetchImpl,
      headers: this.headers,
      timeoutMs: this.timeoutMs,
      maxRetries: this.maxRetries,
      ...(this.sleep ? { sleep: this.sleep } : {}),
    });
    return res.body;
  }

  // ---- system probes -------------------------------------------------

  async health(): Promise<Record<string, unknown>> {
    const body = await this.get("/health");
    return isRecord(body) ? body : {};
  }

  async ready(): Promise<Record<string, unknown>> {
    const body = await this.get("/ready");
    return isRecord(body) ? body : {};
  }

  // ---- keyless -------------------------------------------------------

  /** End-of-day OHLCV rows for one symbol over a date range. */
  async ohlcv(symbol: string, exchange: string, range: DateRange = {}): Promise<OHLCV[]> {
    const body = await this.get(`/v1/ohlcv/${normalizeExchange(exchange)}/${normalizeSymbol(symbol)}`, rangeQuery(range));
    return envelopeData<OHLCV>(body);
  }

  /** Same as `ohlcv` but returns the full `{ data, meta }` envelope. */
  async ohlcvEnvelope(symbol: string, exchange: string, range: DateRange = {}): Promise<Envelope<OHLCV[]>> {
    const body = await this.get(`/v1/ohlcv/${normalizeExchange(exchange)}/${normalizeSymbol(symbol)}`, rangeQuery(range));
    return isRecord(body) ? (body as unknown as Envelope<OHLCV[]>) : { data: [] };
  }

  /** Every symbol's bhavcopy line for one trading date on one exchange. */
  async snapshot(exchange: string, date: string): Promise<SnapshotRow[]> {
    const body = await this.get(`/v1/snapshot/${normalizeExchange(exchange)}`, { date: validateDate(date, "date") });
    return envelopeData<SnapshotRow>(body);
  }

  /** All corporate actions ever recorded for one symbol. */
  async actions(symbol: string): Promise<Action[]> {
    const body = await this.get(`/v1/actions/${normalizeSymbol(symbol)}`);
    return envelopeData<Action>(body);
  }

  // ---- free key ------------------------------------------------------

  /** Back-adjusted prices, continuous through splits, bonuses and dividends. Needs a free key. */
  async adjusted(symbol: string, exchange: string, range: DateRange = {}): Promise<AdjustedRow[]> {
    const body = await this.get(`/v1/adjusted/${normalizeExchange(exchange)}/${normalizeSymbol(symbol)}`, rangeQuery(range));
    return envelopeData<AdjustedRow>(body);
  }

  /** Delivery quantity and % per day, NSE only, since 2010. Needs a free key. */
  async delivery(symbol: string, exchange = "nse", range: DateRange = {}): Promise<DeliveryRow[]> {
    const body = await this.get(`/v1/delivery/${normalizeExchange(exchange)}/${normalizeSymbol(symbol)}`, rangeQuery(range));
    return envelopeData<DeliveryRow>(body);
  }

  /** Symbol history by `symbol` or `isin`. Needs a free key. */
  async symbols(exchange: string, by: { symbol?: string; isin?: string }): Promise<SymbolInterval[]> {
    if (by.symbol === undefined && by.isin === undefined) throw new ValidationError("pass { symbol } or { isin }");
    const query: Query = {};
    if (by.symbol !== undefined) query.symbol = normalizeSymbol(by.symbol);
    if (by.isin !== undefined) query.isin = by.isin.trim().toUpperCase();
    const body = await this.get(`/v1/symbols/${normalizeExchange(exchange)}`, query);
    return envelopeData<SymbolInterval>(body);
  }

  /** Account, keys and today's usage for the calling key. */
  async me(): Promise<Me> {
    const body = await this.get("/v1/me");
    return (isRecord(body) ? body : {}) as unknown as Me;
  }

  // ---- pro -----------------------------------------------------------

  /** Per-day derived metrics on adjusted close. Needs a Pro key. */
  async metrics(symbol: string, exchange: string, range: DateRange = {}): Promise<MetricsRow[]> {
    const body = await this.get(`/v1/metrics/${normalizeExchange(exchange)}/${normalizeSymbol(symbol)}`, rangeQuery(range));
    return envelopeData<MetricsRow>(body);
  }

  /**
   * Point-in-time liquidity universe at the latest monthly rebalance on or
   * before `asOf` (default today). Needs a Pro key.
   */
  async universe(name: UniverseName = "liquid500", exchange = "nse", asOf?: string): Promise<UniverseMember[]> {
    const n = String(name).trim().toLowerCase();
    if (n !== "liquid100" && n !== "liquid250" && n !== "liquid500") {
      throw new ValidationError("name must be liquid100, liquid250 or liquid500");
    }
    const query: Query = { exchange: normalizeExchange(exchange) };
    if (asOf !== undefined) query.as_of = validateDate(asOf, "asOf");
    const body = await this.get(`/v1/universe/${n}`, query);
    return envelopeData<UniverseMember>(body);
  }

  /** OHLCV for up to 50 symbols in one request, keyed by symbol. Needs a Pro key. */
  async batch(symbols: Iterable<string>, exchange = "nse", range: DateRange = {}): Promise<Record<string, OHLCV[]>> {
    const syms = Array.from(symbols, normalizeSymbol);
    if (syms.length === 0) throw new ValidationError("symbols must not be empty");
    if (syms.length > 50) throw new ValidationError("at most 50 symbols per batch");
    const query: Query = { ...rangeQuery(range), symbols: syms.join(","), exchange: normalizeExchange(exchange) };
    const body = await this.get("/v1/batch", query);
    const data = isRecord(body) ? body.data : undefined;
    return isRecord(data) ? (data as Record<string, OHLCV[]>) : {};
  }

  /** Resolve free text to symbols, best match first. Needs a Pro key. */
  async resolve(q: string, opts: { exchange?: string; limit?: number } = {}): Promise<ResolveHit[]> {
    const text = q.trim();
    if (text.length < 2 || text.length > 80) throw new ValidationError("q must be 2 to 80 characters");
    const limit = opts.limit ?? 5;
    if (!Number.isInteger(limit) || limit < 1 || limit > 25) throw new ValidationError("limit must be an integer from 1 to 25");
    const ex = opts.exchange === undefined || opts.exchange.toLowerCase() === "both" ? "both" : normalizeExchange(opts.exchange);
    const body = await this.get("/v1/resolve", { q: text, exchange: ex, limit });
    return envelopeData<ResolveHit>(body);
  }

  /**
   * Screen the whole market on one trading day by derived metrics. Needs a
   * Pro key. Use `screenerEnvelope` for `meta.total` and the day used.
   */
  async screener(opts: ScreenerOptions = {}): Promise<ScreenerRow[]> {
    const body = await this.get("/v1/screener", screenerQuery(opts));
    return envelopeData<ScreenerRow>(body);
  }

  /** `screener` with the `meta` block: `date` used, `total` matches before paging. */
  async screenerEnvelope(opts: ScreenerOptions = {}): Promise<Envelope<ScreenerRow[]> & { meta?: ScreenerMeta }> {
    const body = await this.get("/v1/screener", screenerQuery(opts));
    return isRecord(body) ? (body as unknown as Envelope<ScreenerRow[]> & { meta?: ScreenerMeta }) : { data: [] };
  }
}

const SCREENER_COLUMNS = new Set([
  "adj_close",
  "ret_1d", "ret_5d", "ret_21d", "ret_63d", "ret_126d", "ret_252d", "ret_ytd",
  "high_52w", "low_52w", "pct_off_52w_high", "pct_off_52w_low",
  "avg_vol_20d", "avg_vol_60d", "avg_turnover_20d",
]);
const SCREENER_OPS = new Set(["gt", "gte", "lt", "lte"]);

function screenerQuery(o: ScreenerOptions): Query {
  const q: Query = { exchange: normalizeExchange(o.exchange ?? "nse") };
  if (o.date !== undefined) q.date = validateDate(o.date, "date");
  if (o.universe !== undefined) {
    const u = String(o.universe).trim().toLowerCase();
    if (u !== "liquid100" && u !== "liquid250" && u !== "liquid500") {
      throw new ValidationError("universe must be liquid100, liquid250 or liquid500");
    }
    q.universe = u;
  }
  const entries = Object.entries(o.filters ?? {});
  if (entries.length > 10) throw new ValidationError("at most 10 filters per screen");
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    const dot = key.indexOf(".");
    const col = dot < 0 ? key : key.slice(0, dot).trim().toLowerCase();
    const op = dot < 0 ? "" : key.slice(dot + 1).trim().toLowerCase();
    if (!SCREENER_COLUMNS.has(col) || !SCREENER_OPS.has(op)) {
      throw new ValidationError(`filter ${JSON.stringify(key)} must be '<column>.<op>' with op in gt, gte, lt, lte`);
    }
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new ValidationError(`filter ${JSON.stringify(key)} value must be a finite number`);
    }
    q[`${col}.${op}`] = value;
  }
  if (o.sort !== undefined) {
    const s = String(o.sort).trim().toLowerCase();
    if (s !== "symbol" && !SCREENER_COLUMNS.has(s)) throw new ValidationError("sort must be 'symbol' or a metrics column");
    q.sort = s;
  }
  if (o.order !== undefined) {
    if (o.order !== "asc" && o.order !== "desc") throw new ValidationError("order must be 'asc' or 'desc'");
    q.order = o.order;
  }
  if (o.limit !== undefined) {
    if (!Number.isInteger(o.limit) || o.limit < 1 || o.limit > 500) throw new ValidationError("limit must be an integer from 1 to 500");
    q.limit = o.limit;
  }
  if (o.offset !== undefined) {
    if (!Number.isInteger(o.offset) || o.offset < 0) throw new ValidationError("offset must be an integer, 0 or more");
    q.offset = o.offset;
  }
  return q;
}

function rangeQuery(range: DateRange): Query {
  const q: Query = {};
  if (range.from !== undefined) q.from = validateDate(range.from, "from");
  if (range.to !== undefined) q.to = validateDate(range.to, "to");
  return q;
}
