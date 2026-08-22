import { describe, expect, it } from "vitest";

import type { PlaygroundQueryInput } from "../src/lib/playground-contracts.js";
import { ProxyGate, type ProxyGatePolicy } from "../src/server/proxy-gate.js";
import {
  handlePublicQuery,
  loadProxyGatePolicy,
  loadPublicQueryConfig,
  type ProxyFetcher,
  type PublicQueryDependencies,
} from "../src/server/public-query.js";

const TOKEN = "a".repeat(32);
const POLICY: ProxyGatePolicy = {
  maxActive: 2,
  maxStartsPerCaller: 2,
  maxStartsPerWindow: 4,
  maxTrackedCallers: 4,
  windowMs: 60_000,
};

interface RecordedRequest {
  readonly input: string | URL;
  readonly init: RequestInit;
}

function dependencies(
  fetcher: ProxyFetcher,
  policy: ProxyGatePolicy = POLICY,
): PublicQueryDependencies {
  return {
    config: {
      apiBaseUrl: "http://api.railway.internal:3000",
      apiOriginToken: TOKEN,
      maxBodyBytes: 2_048,
      upstreamTimeoutMs: 7_000,
    },
    fetcher,
    gate: new ProxyGate(policy),
  };
}

function queryRequest(body: string, address = "203.0.113.10"): Request {
  return new Request("https://query.host/api/query", {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": address,
    },
    method: "POST",
  });
}

describe("public query proxy", () => {
  it("canonicalizes validated input and keeps the origin token server-side", async () => {
    const calls: RecordedRequest[] = [];
    const hostedBody = JSON.stringify({
      cache: { ageMs: 0, status: "miss", ttlMs: 10_000 },
      durationMs: 42,
      error: { code: "TIMEOUT", message: "Timed out." },
      game: "minecraft-java",
      ok: false,
      sources: [],
      warnings: [],
    });
    const fetcher: ProxyFetcher = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(
        new Response(hostedBody, {
          headers: {
            "Content-Type": "application/json",
            "x-queryhost-cache": "miss",
          },
          status: 200,
        }),
      );
    };

    const response = await handlePublicQuery(
      queryRequest(
        JSON.stringify({
          game: "mc",
          host: " PLAY.EXAMPLE.COM. ",
          mode: "full",
        }),
      ),
      dependencies(fetcher),
    );

    expect(response.status).toBe(200);
    const responseText = await response.text();
    expect(responseText).toBe(hostedBody);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-queryhost-cache")).toBe("miss");
    expect(calls).toHaveLength(1);
    expect(String(calls[0]?.input)).toBe(
      "http://api.railway.internal:3000/query",
    );
    const headers = new Headers(calls[0]?.init.headers);
    expect(headers.get("x-queryhost-origin-token")).toBe(TOKEN);
    const forwardedBody = calls[0]?.init.body;
    if (typeof forwardedBody !== "string") {
      throw new Error("The forwarded request body should be JSON text.");
    }
    const forwarded = JSON.parse(forwardedBody) as PlaygroundQueryInput;
    expect(forwarded).toEqual({
      game: "minecraft-java",
      host: "play.example.com",
      mode: "full",
    });
    expect(responseText).not.toContain(TOKEN);
  });

  it("rejects malformed and excess callers before private API work", async () => {
    let calls = 0;
    const fetcher: ProxyFetcher = () => {
      calls += 1;
      return Promise.resolve(
        new Response("{}", { headers: { "Content-Type": "application/json" } }),
      );
    };
    const limitedPolicy: ProxyGatePolicy = {
      ...POLICY,
      maxStartsPerCaller: 1,
      maxStartsPerWindow: 1,
    };
    const shared = dependencies(fetcher, limitedPolicy);

    const invalid = await handlePublicQuery(
      queryRequest(
        JSON.stringify({ game: "rust", host: "https://bad.example" }),
      ),
      shared,
    );
    expect(invalid.status).toBe(400);
    expect(calls).toBe(0);

    const validBody = JSON.stringify({
      game: "rust",
      host: "play.example.com",
    });
    expect(
      (await handlePublicQuery(queryRequest(validBody), shared)).status,
    ).toBe(200);
    const limited = await handlePublicQuery(queryRequest(validBody), shared);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(calls).toBe(1);
  });

  it("keeps API failures distinct from unavailable or invalid upstreams", async () => {
    const apiFailure = await handlePublicQuery(
      queryRequest(JSON.stringify({ game: "rust", host: "play.example.com" })),
      dependencies(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "OVERLOADED", message: "Query capacity is full." },
            }),
            {
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "1",
              },
              status: 429,
            },
          ),
        ),
      ),
    );
    expect(apiFailure.status).toBe(429);
    expect(apiFailure.headers.get("retry-after")).toBe("1");
    expect(await apiFailure.text()).toContain("OVERLOADED");

    const unavailable = await handlePublicQuery(
      queryRequest(
        JSON.stringify({ game: "rust", host: "play.example.com" }),
        "203.0.113.11",
      ),
      dependencies(() => Promise.reject(new Error("offline"))),
    );
    expect(unavailable.status).toBe(502);
    expect(await unavailable.text()).toContain("UPSTREAM_UNAVAILABLE");
  });
});

describe("public query configuration", () => {
  it("requires a bounded private origin and token", () => {
    expect(() => loadPublicQueryConfig({})).toThrow("QUERYHOST_API_BASE_URL");
    expect(
      loadPublicQueryConfig({
        QUERYHOST_API_BASE_URL: "http://api.railway.internal:3000",
        QUERYHOST_API_ORIGIN_TOKEN: TOKEN,
      }),
    ).toMatchObject({
      apiBaseUrl: "http://api.railway.internal:3000",
      apiOriginToken: TOKEN,
    });
    expect(() =>
      loadPublicQueryConfig({
        QUERYHOST_API_BASE_URL: "http://user@example.com/path",
        QUERYHOST_API_ORIGIN_TOKEN: TOKEN,
      }),
    ).toThrow("HTTP origin URL");
  });

  it("rejects caller limits that exceed the global budget", () => {
    expect(() =>
      loadProxyGatePolicy({
        QUERYHOST_WEB_MAX_STARTS_PER_CALLER: "9",
        QUERYHOST_WEB_MAX_STARTS_PER_WINDOW: "8",
      }),
    ).toThrow("cannot exceed");
  });
});
