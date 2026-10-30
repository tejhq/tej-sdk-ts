# tejhq

[![npm](https://img.shields.io/npm/v/tejhq.svg)](https://www.npmjs.com/package/tejhq)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

TypeScript SDK for [tej-api](https://api.tejhq.dev): open, free, end-of-day market data for NSE and BSE. No signup for prices, snapshots and corporate actions.

**Zero runtime dependencies.** Built on `fetch`, so it runs on Node 18+, Bun, Deno, Cloudflare Workers and browsers. Ships ESM and CommonJS with full type declarations. Rows come back as plain objects with the API's field names, ready for a chart, a table, or `JSON.stringify`.

## Install

```bash
npm install tejhq
```

Same package name as the Python SDK on PyPI. Import as `tejhq`.

## Quick start

```ts
import { Client } from "tejhq";

const c = new Client();

// Last 90 days of RELIANCE (server default range)
const rows = await c.ohlcv("RELIANCE", "nse");
console.log(rows.at(-1));
// { date: '2026-09-05', open: 1442, high: 1455.7, ... }

// Full history since 2010
const all = await c.ohlcv("RELIANCE", "nse", { from: "2010-01-04", to: "2026-09-05" });
console.log(all.length); // ~4100

// Every symbol on one trading date
const snap = await c.snapshot("nse", "2025-05-28");
console.log(snap.length); // ~2300

// Corporate actions: dividends, splits, bonuses
const acts = await c.actions("RELIANCE");
console.log(acts[0]);
// { exchange: 'NSE', type: 'dividend', ex_date: '2024-10-28', cash_amount: 10, ... }
```

CommonJS works the same way:

```js
const { Client } = require("tejhq");
```

### Fan out

Every method returns a promise, so concurrency is `Promise.all`:

```ts
const symbols = ["RELIANCE", "TCS", "INFY", "HDFCBANK", "ICICIBANK"];
const results = await Promise.all(symbols.map((s) => c.ohlcv(s, "nse")));
```

Keyless traffic is limited to 100 requests per 10 seconds per IP at the edge. The SDK retries 429s with backoff, but for more than a handful of symbols the Pro `batch` endpoint is one request instead of fifty.

## Free key endpoints

Get a key at [tejhq.dev/keys](https://tejhq.dev/keys), no card, no password.

```ts
const c = new Client({ apiKey: "tej_live_..." });

// Back-adjusted prices, continuous through splits, bonuses and dividends
const adj = await c.adjusted("RELIANCE", "nse", { from: "2024-10-01", to: "2024-11-30" });
console.log(adj.at(-1)?.adj_close, adj.at(-1)?.adj_factor_cumulative);

// Symbol history by ISIN or symbol
await c.symbols("nse", { isin: "INE040A01034" });
await c.symbols("nse", { symbol: "HDFCBANK" });

// Account, keys, today's usage
const me = await c.me();
console.log(me.usage_today); // { used: 12, limit: 1000, per_minute: 300 }
```

## Pro endpoints

```ts
const c = new Client({ apiKey: "tej_live_..." }); // a key on the Pro tier

// Derived metrics per day: returns, 52w high/low, average volume and turnover
const m = await c.metrics("RELIANCE", "nse", { from: "2026-01-01" });

// Point-in-time liquidity universe, survivorship-bias-free
const members = await c.universe("liquid500", "nse", "2019-03-15");
const names = members.map((x) => x.symbol);

// Up to 50 symbols in one request, object keyed by symbol
const bars = await c.batch(["RELIANCE", "TCS", "INFY"], "nse", { from: "2026-01-01" });
console.log(Object.keys(bars)); // ['INFY', 'RELIANCE', 'TCS']

// Free text to symbol
await c.resolve("tata motors", { exchange: "nse", limit: 3 });
await c.resolve("zomato"); // former ticker resolves to the current one

// Screen the market: liquid names up more than 5% this month, within 5% of the 52w high
const hits = await c.screener({
  exchange: "nse",
  universe: "liquid500",
  filters: { "ret_21d.gt": 0.05, "pct_off_52w_high.gte": -0.05, "avg_turnover_20d.gte": 5e7 },
  sort: "ret_21d",
  limit: 20,
});
const { meta } = await c.screenerEnvelope({ date: "2019-03-15", universe: "liquid100" });
console.log(meta?.date, meta?.total); // day actually used, matches before paging
```

## API reference

| Method | Endpoint | Tier | Returns |
| --- | --- | --- | --- |
| `c.ohlcv(symbol, exchange, { from?, to? })` | `GET /v1/ohlcv/{exchange}/{symbol}` | keyless | `OHLCV[]` |
| `c.ohlcvEnvelope(symbol, exchange, { from?, to? })` | same, with `meta` | keyless | `Envelope<OHLCV[]>` |
| `c.snapshot(exchange, date)` | `GET /v1/snapshot/{exchange}?date=` | keyless | `SnapshotRow[]` |
| `c.actions(symbol)` | `GET /v1/actions/{symbol}` | keyless | `Action[]` |
| `c.adjusted(symbol, exchange, { from?, to? })` | `GET /v1/adjusted/{exchange}/{symbol}` | free key | `AdjustedRow[]` |
| `c.symbols(exchange, { symbol } \| { isin })` | `GET /v1/symbols/{exchange}` | free key | `SymbolInterval[]` |
| `c.me()` | `GET /v1/me` | free key | `Me` |
| `c.metrics(symbol, exchange, { from?, to? })` | `GET /v1/metrics/{exchange}/{symbol}` | pro | `MetricsRow[]` |
| `c.universe(name = "liquid500", exchange = "nse", asOf?)` | `GET /v1/universe/{name}` | pro | `UniverseMember[]` |
| `c.batch(symbols, exchange = "nse", { from?, to? })` | `GET /v1/batch` | pro | `Record<string, OHLCV[]>` |
| `c.resolve(q, { exchange?, limit? })` | `GET /v1/resolve` | pro | `ResolveHit[]` |
| `c.screener({ exchange?, date?, universe?, filters?, sort?, order?, limit?, offset? })` | `GET /v1/screener` | pro | `ScreenerRow[]` |
| `c.screenerEnvelope(...)` | same, with `meta.total` and `meta.date` | pro | `Envelope<ScreenerRow[]>` |
| `c.health()`, `c.ready()` | `GET /health`, `GET /ready` | keyless | `Record<string, unknown>` |

Symbols are uppercased and exchanges lowercased before the request. Dates must be `YYYY-MM-DD`. Every row type is exported, so `import type { OHLCV, MetricsRow } from "tejhq"` works.

## Configuration

```ts
import { Client } from "tejhq";

const c = new Client({
  baseUrl: "https://api.tejhq.dev",   // override for self-hosted or staging
  apiKey: undefined,                   // tej_live_... from https://tejhq.dev/keys
  timeoutMs: 30_000,                   // per request, via AbortController
  maxRetries: 3,                       // exponential backoff on 5xx/429/network
  userAgentSuffix: "my-app/1.0",       // for attribution
  defaultHeaders: { "X-My-Header": "hi" },
  fetch: globalThis.fetch,             // inject your own, e.g. undici or a test stub
});
```

Browsers ignore the `User-Agent` header; everything else works unchanged. The API sends permissive CORS headers, so a key can be used from a browser app, but treat it like any secret: a key in client-side code is visible to whoever opens dev tools.

## Errors

Every error extends `TejError` and carries `statusCode`, `errorCode` and `requestId` when the API supplied them.

| Class | When |
| --- | --- |
| `ValidationError` | Thrown locally before any request: bad exchange, symbol, date, or argument |
| `BadRequestError` | HTTP 400, bad path or query parameter |
| `AuthError` | HTTP 401, `key_required` when no key was sent to a gated endpoint, `invalid_key` when the key is malformed, unknown, or revoked |
| `ProRequiredError` | HTTP 402, the key's tier is too low for this endpoint |
| `NotFoundError` | HTTP 404 |
| `RateLimitError` | HTTP 429 after retries |
| `ServerError` | HTTP 5xx after retries, or a malformed success body |
| `NetworkError` | DNS, connection, TLS, abort, or timeout after retries |
| `TejError` | Anything else |

```ts
import { Client, AuthError, ProRequiredError } from "tejhq";

try {
  await new Client().adjusted("RELIANCE", "nse");
} catch (e) {
  if (e instanceof AuthError) console.log(e.errorCode);     // 'key_required'
  if (e instanceof ProRequiredError) console.log(e.requestId);
}
```

## Runtime notes

- **Node 18+** uses the built-in `fetch`. Node 16 and older: pass `{ fetch }` from `undici` or `node-fetch`.
- **Bun and Deno** work out of the box.
- **Cloudflare Workers, Vercel Edge** work; `AbortController` and `fetch` are native there.
- **Browsers** work for keyless endpoints and for keyed ones if you accept the key being visible.

## Why a separate package

[tej-api](https://github.com/tejhq/tej-api) is a Go service. [tej-sdk-py](https://github.com/tejhq/tej-sdk-py) is the Python client with the same surface. This package is the thin client that anyone can `npm install` and that releases on its own cadence as the API evolves.

## Coverage

- **NSE bhavcopy + corp actions**: 2010-01-04 to today, ~4,100 trading days, ~7M rows
- **BSE bhavcopy + corp actions**: 2024-07-08 to today, the SEBI CMTS cutover
- **Cron refresh**: weekdays 20:00 IST

Keyless endpoints are served at the Cloudflare edge from pre-rendered JSON, so most requests return in well under a second and repeat requests are cache hits. Keyed requests bypass the edge cache and carry `X-RateLimit-Limit-Day` and `X-RateLimit-Remaining-Day` headers: 1,000 a day and 300 a minute on a free key.

## License

MIT. Use it, fork it, ship products on top of it.

## Links

- API docs: [tejhq.dev/docs](https://tejhq.dev/docs)
- OpenAPI spec: [api.tejhq.dev/openapi.yaml](https://api.tejhq.dev/openapi.yaml)
- Python SDK: [pypi.org/project/tejhq](https://pypi.org/project/tejhq/)
- Bulk parquet: [huggingface.co/datasets/tejhq/indian-markets](https://huggingface.co/datasets/tejhq/indian-markets)
- Issues: [github.com/tejhq/tej-sdk-ts/issues](https://github.com/tejhq/tej-sdk-ts/issues)
