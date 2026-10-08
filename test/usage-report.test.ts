import { describe, expect, it } from "vitest";

import { ProxyGate } from "../src/server/proxy-gate.js";
import type {
  ProxyFetcher,
  PublicQueryDependencies,
} from "../src/server/public-query.js";
import {
  handleUsageReport,
  loadUsageReportToken,
  type UsageReport,
  type UsageReportDependencies,
} from "../src/server/usage-report.js";
import { GamesUsage, SurfaceUsage } from "../src/server/usage-stats.js";

const STATS_TOKEN = "s".repeat(32);
const ORIGIN_TOKEN = "a".repeat(32);
const URL_STATS = "https://query.host/api/stats";

interface RecordedRequest {
  readonly input: string | URL;
  readonly init: RequestInit;
}

function surface(fetcher: ProxyFetcher): PublicQueryDependencies {
  return {
    config: {
      maxBodyBytes: 2_048,
      target: {
        apiBaseUrl: "http://api.railway.internal:3000",
        apiOriginToken: ORIGIN_TOKEN,
        kind: "hosted",
      },
      upstreamTimeoutMs: 7_000,
    },
    fetcher,
    gate: new ProxyGate({
      maxActive: 2,
      maxStartsPerCaller: 2,
      maxStartsPerWindow: 4,
      maxTrackedCallers: 4,
      windowMs: 60_000,
    }),
    queryRunner: () => Promise.reject(new Error("unused")),
    usage: new SurfaceUsage(),
  };
}

function reportDependencies(fetcher: ProxyFetcher): UsageReportDependencies {
  return {
    token: STATS_TOKEN,
    startedAt: Date.UTC(2026, 9, 8),
    playground: surface(fetcher),
    publicApi: surface(fetcher),
    games: new GamesUsage(),
  };
}

function authorized(token = STATS_TOKEN): Request {
  return new Request(URL_STATS, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

const apiStats: ProxyFetcher = () =>
  Promise.resolve(
    Response.json({ queries: { hit: 3, miss: 1, coalesced: 0 } }),
  );

describe("usage report", () => {
  it("stays disabled unless a stats token is configured", async () => {
    expect(loadUsageReportToken({})).toBeUndefined();
    expect(() =>
      loadUsageReportToken({ QUERYHOST_WEB_STATS_TOKEN: "short" }),
    ).toThrow("32 through 256");

    const response = await handleUsageReport(authorized(), {
      ...reportDependencies(apiStats),
      token: undefined,
    });
    expect(response.status).toBe(404);
  });

  it("requires the bearer token and GET", async () => {
    const deps = reportDependencies(apiStats);

    const missing = await handleUsageReport(new Request(URL_STATS), deps);
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toBe("Bearer");

    const wrong = await handleUsageReport(authorized("x".repeat(32)), deps);
    expect(wrong.status).toBe(401);

    const post = await handleUsageReport(
      new Request(URL_STATS, { method: "POST" }),
      deps,
    );
    expect(post.status).toBe(405);
  });

  it("combines web surfaces with the private API's counters", async () => {
    const calls: RecordedRequest[] = [];
    const deps = reportDependencies((input, init) => {
      calls.push({ input, init });
      return apiStats(input, init);
    });
    deps.publicApi.usage.recordRateLimited("caller");
    deps.games.record(true);

    const response = await handleUsageReport(authorized(), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const report = (await response.json()) as UsageReport;
    expect(report).toMatchObject({
      startedAt: "2026-10-08T00:00:00.000Z",
      publicApi: { requests: { rateLimited: 1 }, rateLimited: { caller: 1 } },
      games: { ok: 0, notModified: 1 },
      api: { queries: { hit: 3, miss: 1, coalesced: 0 } },
    });
    expect(String(calls[0]?.input)).toBe(
      "http://api.railway.internal:3000/stats",
    );
    expect(
      new Headers(calls[0]?.init.headers).get("x-queryhost-origin-token"),
    ).toBe(ORIGIN_TOKEN);
  });

  it("reports api as null when the private API cannot answer", async () => {
    for (const fetcher of [
      (): Promise<Response> => Promise.reject(new Error("down")),
      (): Promise<Response> =>
        Promise.resolve(Response.json({ error: {} }, { status: 404 })),
    ]) {
      const response = await handleUsageReport(
        authorized(),
        reportDependencies(fetcher),
      );
      expect(response.status).toBe(200);
      expect(((await response.json()) as UsageReport).api).toBeNull();
    }
  });
});
