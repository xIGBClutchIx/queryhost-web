import { describe, expect, it } from "vitest";

import type { PlaygroundQueryInput } from "../src/lib/playground-contracts.js";
import { ProxyGate, type ProxyGatePolicy } from "../src/server/proxy-gate.js";
import {
  handlePublicQuery,
  loadProxyGatePolicy,
  loadPublicQueryConfig,
  type LocalQueryRunner,
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

const unusedQueryRunner: LocalQueryRunner = () =>
  Promise.reject(new Error("The local query runner should not be called."));

function dependencies(
  fetcher: ProxyFetcher,
  policy: ProxyGatePolicy = POLICY,
): PublicQueryDependencies {
  return {
    config: {
      maxBodyBytes: 2_048,
      target: {
        apiBaseUrl: "http://api.railway.internal:3000",
        apiOriginToken: TOKEN,
        kind: "hosted",
      },
      upstreamTimeoutMs: 7_000,
    },
    fetcher,
    gate: new ProxyGate(policy),
    queryRunner: unusedQueryRunner,
  };
}

function queryRequest(body: string, address = "203.0.113.10"): Request {
  return new Request("https://query.host/api/query", {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": address,
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

  it("uses Railway's client address instead of a supplied forwarding chain", async () => {
    let calls = 0;
    const shared = dependencies(
      () => {
        calls += 1;
        return Promise.resolve(
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
        );
      },
      { ...POLICY, maxStartsPerCaller: 1 },
    );
    const body = JSON.stringify({ game: "rust", host: "play.example.com" });
    const first = queryRequest(body, "203.0.113.20");
    const second = queryRequest(body, "203.0.113.21");
    first.headers.set("x-forwarded-for", "198.51.100.8");
    second.headers.set("x-forwarded-for", "198.51.100.8");

    expect((await handlePublicQuery(first, shared)).status).toBe(200);
    expect((await handlePublicQuery(second, shared)).status).toBe(200);
    expect(calls).toBe(2);
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

  it("runs live queries locally without a Railway API dependency", async () => {
    const inputs: PlaygroundQueryInput[] = [];
    const queryRunner: LocalQueryRunner = (input) => {
      inputs.push(input);
      return Promise.resolve({
        durationMs: 12,
        game: input.game,
        ok: true,
        partial: false,
        server: { name: "Local server" },
        data: {},
        sources: [],
        warnings: [],
      });
    };
    const shared: PublicQueryDependencies = {
      config: {
        maxBodyBytes: 2_048,
        target: { kind: "local" },
        upstreamTimeoutMs: 7_000,
      },
      fetcher: () =>
        Promise.reject(new Error("The hosted API should not be called.")),
      gate: new ProxyGate(POLICY),
      queryRunner,
    };

    const response = await handlePublicQuery(
      queryRequest(JSON.stringify({ game: "mc", host: "PLAY.EXAMPLE.COM" })),
      shared,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-queryhost-cache")).toBe("miss");
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatchObject({
      game: "minecraft-java",
      host: "play.example.com",
    });
    const body = JSON.parse(await response.text()) as {
      readonly cache: { readonly status: string; readonly ttlMs: number };
      readonly ok: boolean;
    };
    expect(body).toMatchObject({
      cache: { status: "miss", ttlMs: 0 },
      ok: true,
    });
  });
});

describe("public query configuration", () => {
  it("uses local queries outside production and requires hosted production configuration", () => {
    expect(loadPublicQueryConfig({})).toMatchObject({
      target: { kind: "local" },
    });
    expect(() => loadPublicQueryConfig({ NODE_ENV: "production" })).toThrow(
      "required in production",
    );
    expect(
      loadPublicQueryConfig({
        QUERYHOST_API_BASE_URL: "http://api.railway.internal:3000",
        QUERYHOST_API_ORIGIN_TOKEN: TOKEN,
      }),
    ).toMatchObject({
      target: {
        apiBaseUrl: "http://api.railway.internal:3000",
        apiOriginToken: TOKEN,
        kind: "hosted",
      },
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
