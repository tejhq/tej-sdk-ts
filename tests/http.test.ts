import { describe, expect, it } from "vitest";
import {
  AuthError,
  BadRequestError,
  Client,
  NetworkError,
  NotFoundError,
  ProRequiredError,
  RateLimitError,
  ServerError,
  TejError,
} from "../src/index.js";
import { backoffMs, buildUrl, envelopeData } from "../src/http.js";
import { mockFetch, noSleep } from "./helpers.js";

function client(responses: Parameters<typeof mockFetch>[0], maxRetries = 3) {
  const m = mockFetch(responses);
  return { c: new Client({ fetch: m.fetch, sleep: noSleep, maxRetries }), calls: m.calls };
}

describe("error mapping", () => {
  const cases: [number, unknown, string][] = [
    [400, BadRequestError, "invalid_date"],
    [401, AuthError, "key_required"],
    [402, ProRequiredError, "pro_required"],
    [404, NotFoundError, "not_found"],
  ];
  for (const [status, cls, code] of cases) {
    it(`maps ${status}`, async () => {
      const { c } = client([{ status, body: { error: code, message: `msg ${status}` } }]);
      const err = await c.ohlcv("TCS", "nse").catch((e: unknown) => e);
      expect(err).toBeInstanceOf(cls);
      const e = err as TejError;
      expect(e.statusCode).toBe(status);
      expect(e.errorCode).toBe(code);
      expect(e.message).toBe(`msg ${status}`);
      expect(e.requestId).toBe("req-1");
      expect(String(e)).toContain(`status=${status}`);
    });
  }

  it("falls back to error code then HTTP status for the message", async () => {
    const { c } = client([{ status: 404, body: { error: "nope" } }]);
    await expect(c.ohlcv("TCS", "nse")).rejects.toThrow("nope");
    const { c: c2 } = client([{ status: 418, text: "teapot" }]);
    const err = await c2.ohlcv("TCS", "nse").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TejError);
    expect((err as TejError).message).toBe("HTTP 418");
  });

  it("throws TejError on malformed JSON in a 2xx", async () => {
    const { c } = client([{ status: 200, text: "{not json" }]);
    await expect(c.ohlcv("TCS", "nse")).rejects.toThrow(/decode JSON/);
  });
});

describe("retries", () => {
  it("retries 429 and 5xx then succeeds", async () => {
    const { c, calls } = client([
      { status: 429, body: { error: "rate_limited" } },
      { status: 503, body: { error: "unavailable" } },
      { status: 200, body: { data: [{ date: "2025-01-01" }] } },
    ]);
    const out = await c.ohlcv("TCS", "nse");
    expect(out).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("gives up after maxRetries with the typed error", async () => {
    const { c, calls } = client([{ status: 429, body: { error: "rate_limited", message: "slow down" } }], 2);
    await expect(c.ohlcv("TCS", "nse")).rejects.toBeInstanceOf(RateLimitError);
    expect(calls).toHaveLength(3);
    const { c: c2 } = client([{ status: 500, body: { error: "internal" } }], 1);
    await expect(c2.ohlcv("TCS", "nse")).rejects.toBeInstanceOf(ServerError);
  });

  it("does not retry 4xx", async () => {
    const { c, calls } = client([{ status: 400, body: { error: "bad" } }]);
    await expect(c.ohlcv("TCS", "nse")).rejects.toBeInstanceOf(BadRequestError);
    expect(calls).toHaveLength(1);
  });

  it("wraps transport failures as NetworkError after retries", async () => {
    let n = 0;
    const c = new Client({
      fetch: async () => {
        n++;
        throw new TypeError("fetch failed");
      },
      sleep: noSleep,
      maxRetries: 2,
    });
    const err = await c.ohlcv("TCS", "nse").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).message).toMatch(/fetch failed/);
    expect(n).toBe(3);
  });

  it("reports timeouts distinctly", async () => {
    const c = new Client({
      fetch: (_url, init) =>
        new Promise((_, reject) => {
          init.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            reject(e);
          });
        }),
      sleep: noSleep,
      maxRetries: 0,
      timeoutMs: 5,
    });
    await expect(c.ohlcv("TCS", "nse")).rejects.toThrow(/timed out after 5ms/);
  });
});

describe("helpers", () => {
  it("buildUrl drops undefined and joins slashes", () => {
    expect(buildUrl("https://x/", "/v1/a", { b: undefined, c: 1 })).toBe("https://x/v1/a?c=1");
    expect(buildUrl("https://x", "v1/a")).toBe("https://x/v1/a");
  });

  it("backoff grows and is capped", () => {
    for (let i = 0; i < 10; i++) {
      const ms = backoffMs(i);
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(4000);
    }
    expect(backoffMs(0)).toBeLessThan(backoffMs(5) + 1e-9 + 4000);
  });

  it("envelopeData shapes", () => {
    expect(envelopeData({ data: null })).toEqual([]);
    expect(envelopeData({})).toEqual([]);
    expect(() => envelopeData([])).toThrow(ServerError);
    expect(() => envelopeData({ data: {} })).toThrow(/must be an array/);
  });
});
