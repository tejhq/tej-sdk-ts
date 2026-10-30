# Changelog

## 0.1.0

First release. Feature parity with tej-sdk-py 0.3.0.

- `Client` with `ohlcv`, `ohlcvEnvelope`, `snapshot`, `actions` (keyless), `adjusted`, `symbols`, `me` (free key), `metrics`, `universe`, `batch`, `resolve`, `screener`, `screenerEnvelope` (Pro), `health`, `ready`.
- Typed rows with the API's snake_case field names.
- Typed errors: `ValidationError`, `BadRequestError`, `AuthError`, `ProRequiredError`, `NotFoundError`, `RateLimitError`, `ServerError`, `NetworkError`, all extending `TejError`.
- Retry with exponential backoff on 429, 5xx and transport failures. Per-request timeout via `AbortController`.
- ESM and CommonJS builds, zero runtime dependencies, Node 18+, Bun, Deno, browsers.
