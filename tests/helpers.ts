import type { FetchLike } from "../src/http.js";

export interface Call {
  url: string;
  init: RequestInit;
}

export interface MockResponse {
  status?: number;
  body?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/** Fetch stub that replays `responses` in order and records every call. */
export function mockFetch(responses: MockResponse[]): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  let i = 0;
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (!r) throw new Error("no mock response");
    const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
    return new Response(text, {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", "x-request-id": "req-1", ...(r.headers ?? {}) },
    });
  };
  return { fetch, calls };
}

export const noSleep = async (): Promise<void> => {};
