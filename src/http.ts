import { NetworkError, ServerError, TejError, ValidationError, fromStatus } from "./errors.js";
import { VERSION } from "./version.js";

export const DEFAULT_BASE_URL = "https://api.tejhq.dev";
export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RETRIES = 3;
export const USER_AGENT = `tej-sdk-ts/${VERSION}`;

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const SYMBOL_RE = /^[A-Za-z0-9][A-Za-z0-9\-&]{0,29}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

export function normalizeExchange(value: string): "nse" | "bse" {
  if (typeof value !== "string") throw new ValidationError(`exchange must be a string, got ${typeof value}`);
  const v = value.trim().toLowerCase();
  if (v !== "nse" && v !== "bse") throw new ValidationError(`exchange must be 'nse' or 'bse', got ${JSON.stringify(value)}`);
  return v;
}

export function normalizeSymbol(value: string): string {
  if (typeof value !== "string") throw new ValidationError(`symbol must be a string, got ${typeof value}`);
  const v = value.trim().toUpperCase();
  if (!SYMBOL_RE.test(v)) throw new ValidationError(`symbol must match [A-Z0-9][A-Z0-9-&]{0,29}, got ${JSON.stringify(value)}`);
  return v;
}

export function validateDate(value: string, field: string): string {
  if (typeof value !== "string") throw new ValidationError(`${field} must be a string (YYYY-MM-DD), got ${typeof value}`);
  if (!DATE_RE.test(value)) throw new ValidationError(`${field} must be YYYY-MM-DD, got ${JSON.stringify(value)}`);
  return value;
}

export type Query = Record<string, string | number | undefined>;

export function buildUrl(baseUrl: string, path: string, query?: Query): string {
  let url = baseUrl.replace(/\/+$/, "") + "/" + path.replace(/^\/+/, "");
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += "?" + qs;
  }
  return url;
}

export function backoffMs(attempt: number, baseMs = 400, capMs = 4000): number {
  const expo = Math.min(capMs, baseMs * 2 ** attempt);
  return expo / 2 + Math.random() * (expo / 2);
}

const defaultSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export interface RequestOptions {
  fetch: FetchLike;
  headers: Record<string, string>;
  timeoutMs: number;
  maxRetries: number;
  sleep?: Sleep;
}

export interface JsonResponse {
  status: number;
  body: unknown;
  headers: Headers;
}

/** One GET with retry and backoff on 429, 5xx and transport failure. */
export async function requestJson(url: string, opts: RequestOptions): Promise<JsonResponse> {
  const sleep = opts.sleep ?? defaultSleep;
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": USER_AGENT, ...opts.headers };
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), opts.timeoutMs);
    let resp: Response;
    try {
      resp = await opts.fetch(url, { method: "GET", headers, signal: ac.signal, redirect: "follow" });
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < opts.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new NetworkError(
        aborted ? `request to ${url} timed out after ${opts.timeoutMs}ms` : `request to ${url} failed: ${String(err)}`,
        { cause: err },
      );
    }
    clearTimeout(timer);

    const requestId = resp.headers.get("x-request-id") ?? undefined;
    const raw = await resp.text();
    const body = parseBody(raw, resp.status, requestId);

    if (RETRYABLE.has(resp.status) && attempt < opts.maxRetries) {
      await sleep(backoffMs(attempt));
      continue;
    }
    raiseForStatus(resp.status, body, requestId);
    return { status: resp.status, body, headers: resp.headers };
  }
  throw new NetworkError(`request to ${url} failed after ${opts.maxRetries} retries: ${String(lastErr)}`, { cause: lastErr });
}

function parseBody(raw: string, status: number, requestId: string | undefined): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    if (status >= 200 && status < 300) {
      throw new TejError(`failed to decode JSON response: ${String(err)}`, { statusCode: status, ...(requestId ? { requestId } : {}) });
    }
    return null;
  }
}

function raiseForStatus(status: number, body: unknown, requestId: string | undefined): void {
  if (status >= 200 && status < 300) return;
  let errorCode: string | undefined;
  let message = `HTTP ${status}`;
  if (isRecord(body)) {
    if (typeof body.error === "string") errorCode = body.error;
    if (typeof body.message === "string" && body.message) message = body.message;
    else if (errorCode) message = errorCode;
  }
  throw fromStatus(status, message, { ...(errorCode ? { errorCode } : {}), ...(requestId ? { requestId } : {}) });
}

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Extract `data` from a standard envelope. */
export function envelopeData<T>(body: unknown): T[] {
  if (!isRecord(body)) throw new ServerError(`unexpected response shape: ${body === null ? "null" : typeof body}`);
  const data = body.data;
  if (data === undefined || data === null) return [];
  if (!Array.isArray(data)) throw new ServerError(`response 'data' must be an array, got ${typeof data}`);
  return data as T[];
}
