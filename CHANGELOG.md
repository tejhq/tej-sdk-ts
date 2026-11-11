# Changelog

## 0.4.0

- `FORow` gains `iv`, `delta`, `gamma`, `theta`, `vega` (options that traded that day), returned by `foChain` and `foContract`.
- `FOStatsRow` gains `atm_iv` and `iv_skew`.
- `foStats(symbol, { from?, to?, expiry? })`: daily F&O figures per expiry (put-call ratio by OI and volume, max pain, futures buildup, basis, rollover %) since 2010. Retail and Pro.
- Unusual activity, NSE, Retail and Pro: `unusual({ date?, signal? })` and `unusualEnvelope` for one day, strongest first, and `unusualHistory(symbol, { from?, to?, signal? })` for one stock since 2010.
- `FOStatsRow`, `FOStatsOptions`, `UnusualRow`, `UnusualSignal`, `UnusualOptions`, `UnusualHistoryOptions`, `UnusualMeta` types.

## 0.3.0

- F&O (NSE futures and options, end of day, since 2010), Retail and Pro: `foChain`, `foChainEnvelope`, `foExpiries`, `foFutures`, `foContract`.
- `FORow`, `FOExpiry`, `FOChainMeta`, `FOContractOptions` types.

## 0.2.0

- `delivery(symbol, exchange?, { from?, to? })`: NSE delivery quantity and % per day since 2010. Free key.
- `DeliveryRow` type.

## 0.1.0

First release. Feature parity with tej-sdk-py 0.3.0.

- `Client` with `ohlcv`, `ohlcvEnvelope`, `snapshot`, `actions` (keyless), `adjusted`, `symbols`, `me` (free key), `metrics`, `universe`, `batch`, `resolve`, `screener`, `screenerEnvelope` (Pro), `health`, `ready`.
- Typed rows with the API's snake_case field names.
- Typed errors: `ValidationError`, `BadRequestError`, `AuthError`, `ProRequiredError`, `NotFoundError`, `RateLimitError`, `ServerError`, `NetworkError`, all extending `TejError`.
- Retry with exponential backoff on 429, 5xx and transport failures. Per-request timeout via `AbortController`.
- ESM and CommonJS builds, zero runtime dependencies, Node 18+, Bun, Deno, browsers.
