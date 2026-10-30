import { describe, expect, it } from "vitest";
import { Client, ValidationError } from "../src/index.js";
import { mockFetch, noSleep } from "./helpers.js";

const rows = [{ date: "2025-01-01", close: 1 }, { date: "2025-01-02", close: 2 }];

function client(responses: Parameters<typeof mockFetch>[0], extra: ConstructorParameters<typeof Client>[0] = {}) {
  const m = mockFetch(responses);
  return { c: new Client({ fetch: m.fetch, sleep: noSleep, ...extra }), calls: m.calls };
}

describe("keyless endpoints", () => {
  it("ohlcv builds path and range query, returns data", async () => {
    const { c, calls } = client([{ body: { data: rows, meta: { count: 2 } } }]);
    const out = await c.ohlcv(" reliance ", "NSE", { from: "2025-01-01", to: "2025-01-31" });
    expect(out).toEqual(rows);
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/ohlcv/nse/RELIANCE?from=2025-01-01&to=2025-01-31");
    expect(calls[0]?.init.method).toBe("GET");
  });

  it("ohlcv without range sends no query string", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await c.ohlcv("TCS", "bse");
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/ohlcv/bse/TCS");
  });

  it("ohlcvEnvelope returns meta", async () => {
    const { c } = client([{ body: { data: rows, meta: { count: 2 } } }]);
    const env = await c.ohlcvEnvelope("TCS", "nse");
    expect(env.meta).toEqual({ count: 2 });
  });

  it("snapshot requires a valid date", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await c.snapshot("nse", "2025-05-28");
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/snapshot/nse?date=2025-05-28");
    await expect(c.snapshot("nse", "28-05-2025")).rejects.toBeInstanceOf(ValidationError);
  });

  it("actions uppercases the symbol", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await c.actions("infy");
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/actions/INFY");
  });

  it("validates exchange and symbol locally, no request sent", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await expect(c.ohlcv("RELIANCE", "mcx")).rejects.toThrow(/exchange must be/);
    await expect(c.ohlcv("bad symbol!", "nse")).rejects.toThrow(/symbol must match/);
    expect(calls).toHaveLength(0);
  });
});

describe("headers and options", () => {
  it("sends bearer key, user agent, and default headers", async () => {
    const { c, calls } = client([{ body: { data: [] } }], {
      apiKey: "tej_live_abc",
      userAgentSuffix: "my-app/1.0",
      defaultHeaders: { "X-My": "hi" },
    });
    await c.ohlcv("TCS", "nse");
    const h = calls[0]?.init.headers as Record<string, string>;
    expect(h["Authorization"]).toBe("Bearer tej_live_abc");
    expect(h["User-Agent"]).toMatch(/^tej-sdk-ts\/\d+\.\d+\.\d+ my-app\/1\.0$/);
    expect(h["X-My"]).toBe("hi");
    expect(h["Accept"]).toBe("application/json");
  });

  it("respects a custom base url with trailing slash", async () => {
    const { c, calls } = client([{ body: { data: [] } }], { baseUrl: "http://localhost:8080/" });
    await c.ohlcv("TCS", "nse");
    expect(calls[0]?.url).toBe("http://localhost:8080/v1/ohlcv/nse/TCS");
  });
});

describe("free key endpoints", () => {
  it("adjusted", async () => {
    const { c, calls } = client([{ body: { data: rows } }]);
    await c.adjusted("reliance", "nse", { from: "2024-10-01" });
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/adjusted/nse/RELIANCE?from=2024-10-01");
  });

  it("symbols by isin or symbol, rejects neither", async () => {
    const { c, calls } = client([{ body: { data: [] } }, { body: { data: [] } }]);
    await c.symbols("nse", { isin: " ine040a01034 " });
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/symbols/nse?isin=INE040A01034");
    await c.symbols("nse", { symbol: "hdfcbank" });
    expect(calls[1]?.url).toBe("https://api.tejhq.dev/v1/symbols/nse?symbol=HDFCBANK");
    await expect(c.symbols("nse", {})).rejects.toBeInstanceOf(ValidationError);
  });

  it("me returns the object", async () => {
    const me = { email: "a@b.c", tier: "free", usage_today: { used: 1, limit: 1000, per_minute: 300 }, keys: [] };
    const { c } = client([{ body: me }]);
    expect(await c.me()).toEqual(me);
  });
});

describe("pro endpoints", () => {
  it("metrics", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await c.metrics("TCS", "nse", { from: "2026-01-01", to: "2026-08-31" });
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/metrics/nse/TCS?from=2026-01-01&to=2026-08-31");
  });

  it("universe defaults and validation", async () => {
    const { c, calls } = client([{ body: { data: [] } }, { body: { data: [] } }]);
    await c.universe();
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/universe/liquid500?exchange=nse");
    await c.universe("liquid100", "bse", "2019-03-15");
    expect(calls[1]?.url).toBe("https://api.tejhq.dev/v1/universe/liquid100?exchange=bse&as_of=2019-03-15");
    // @ts-expect-error runtime guard for JS callers
    await expect(c.universe("liquid50")).rejects.toBeInstanceOf(ValidationError);
  });

  it("batch joins symbols and returns the keyed object", async () => {
    const data = { RELIANCE: rows, TCS: [] };
    const { c, calls } = client([{ body: { data } }]);
    const out = await c.batch(["reliance", "tcs"], "nse", { from: "2026-01-01" });
    expect(out).toEqual(data);
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/batch?from=2026-01-01&symbols=RELIANCE%2CTCS&exchange=nse");
  });

  it("batch limits", async () => {
    const { c } = client([{ body: { data: {} } }]);
    await expect(c.batch([])).rejects.toThrow(/must not be empty/);
    await expect(c.batch(Array.from({ length: 51 }, (_, i) => `S${i}`))).rejects.toThrow(/at most 50/);
  });

  it("resolve defaults to both exchanges and limit 5", async () => {
    const { c, calls } = client([{ body: { data: [] } }, { body: { data: [] } }]);
    await c.resolve("tata motors");
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/resolve?q=tata+motors&exchange=both&limit=5");
    await c.resolve("zomato", { exchange: "NSE", limit: 3 });
    expect(calls[1]?.url).toBe("https://api.tejhq.dev/v1/resolve?q=zomato&exchange=nse&limit=3");
    await expect(c.resolve("x")).rejects.toThrow(/2 to 80/);
    await expect(c.resolve("infy", { limit: 0 })).rejects.toThrow(/1 to 25/);
  });
});

describe("screener", () => {
  it("builds the query from options", async () => {
    const { c, calls } = client([{ body: { data: [{ symbol: "TBZ", ret_21d: 0.95 }], meta: { total: 64, date: "2026-09-07" } } }]);
    const rows = await c.screener({
      exchange: "NSE",
      universe: "liquid500",
      filters: { "ret_21d.gt": 0.05, "pct_off_52w_high.gte": -0.05, "avg_turnover_20d.gte": 5e7 },
      sort: "ret_21d",
      limit: 5,
    });
    expect(rows[0]?.symbol).toBe("TBZ");
    expect(calls[0]?.url).toBe(
      "https://api.tejhq.dev/v1/screener?exchange=nse&universe=liquid500&ret_21d.gt=0.05&pct_off_52w_high.gte=-0.05&avg_turnover_20d.gte=50000000&sort=ret_21d&limit=5",
    );
  });

  it("defaults to nse with no filters", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    await c.screener();
    expect(calls[0]?.url).toBe("https://api.tejhq.dev/v1/screener?exchange=nse");
  });

  it("screenerEnvelope exposes total and date", async () => {
    const { c } = client([{ body: { data: [], meta: { total: 0, date: "2026-09-07", count: 0 } } }]);
    const env = await c.screenerEnvelope({ date: "2026-09-08", filters: { "ret_1d.gt": 5 } });
    expect(env.meta?.total).toBe(0);
    expect(env.meta?.date).toBe("2026-09-07");
  });

  it("validates locally", async () => {
    const { c, calls } = client([{ body: { data: [] } }]);
    // @ts-expect-error runtime guard for JS callers
    await expect(c.screener({ filters: { "foo.gt": 1 } })).rejects.toBeInstanceOf(ValidationError);
    // @ts-expect-error runtime guard for JS callers
    await expect(c.screener({ filters: { "ret_1d.like": 1 } })).rejects.toThrow(/gt, gte, lt, lte/);
    // @ts-expect-error runtime guard for JS callers
    await expect(c.screener({ filters: { "ret_1d.gt": "x" } })).rejects.toThrow(/finite number/);
    // @ts-expect-error runtime guard for JS callers
    await expect(c.screener({ universe: "nifty50" })).rejects.toThrow(/liquid100/);
    // @ts-expect-error runtime guard for JS callers
    await expect(c.screener({ sort: "name" })).rejects.toThrow(/sort must/);
    await expect(c.screener({ limit: 0 })).rejects.toThrow(/1 to 500/);
    await expect(c.screener({ offset: -1 })).rejects.toThrow(/offset/);
    await expect(c.screener({ date: "2026/09/08" })).rejects.toThrow(/YYYY-MM-DD/);
    const eleven = Object.fromEntries(Array.from({ length: 11 }, (_, i) => [`ret_1d.gt`, i]));
    void eleven;
    expect(calls).toHaveLength(0);
  });
});
