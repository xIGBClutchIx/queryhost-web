import { describe, expect, it } from "vitest";

import { GAMES } from "../src/lib/queryhost.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import {
  handlePublicApiGames,
  handlePublicApiNotFound,
  handlePublicApiQuery,
} from "../src/server/public-api.js";
import {
  loadProxyGatePolicy,
  type ProxyFetcher,
  type PublicQueryDependencies,
} from "../src/server/public-query.js";

const API_URL = "https://query.host/api/v1";

function dependencies(fetcher: ProxyFetcher): PublicQueryDependencies {
  return {
    config: {
      maxBodyBytes: 2_048,
      target: {
        apiBaseUrl: "http://api.railway.internal:3000",
        apiOriginToken: "a".repeat(32),
        kind: "hosted",
      },
      upstreamTimeoutMs: 7_000,
    },
    fetcher,
    gate: new ProxyGate({
      maxActive: 2,
      maxStartsPerCaller: 1,
      maxStartsPerWindow: 4,
      maxTrackedCallers: 4,
      windowMs: 60_000,
    }),
    queryRunner: () => Promise.reject(new Error("unused")),
  };
}

function queryRequest(): Request {
  return new Request(`${API_URL}/query`, {
    body: JSON.stringify({ game: "minecraft", host: "mc.example.com" }),
    headers: {
      "Content-Type": "application/json",
      Origin: "https://third-party.example",
      "x-real-ip": "203.0.113.20",
    },
    method: "POST",
  });
}

const upstreamOk: ProxyFetcher = () =>
  Promise.resolve(
    new Response('{"ok":true}', {
      headers: {
        "Content-Type": "application/json",
        "x-queryhost-cache": "miss",
      },
    }),
  );

describe("public API", () => {
  it("answers query preflights without admitting work", async () => {
    let calls = 0;
    const response = await handlePublicApiQuery(
      new Request(`${API_URL}/query`, { method: "OPTIONS" }),
      dependencies(() => {
        calls += 1;
        return upstreamOk("", {});
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-methods")).toBe(
      "POST, OPTIONS",
    );
    expect(response.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
    expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    expect(calls).toBe(0);
  });

  it("adds CORS to forwarded results and to rate-limit rejections", async () => {
    const deps = dependencies(upstreamOk);

    const first = await handlePublicApiQuery(queryRequest(), deps);
    expect(first.status).toBe(200);
    expect(first.headers.get("access-control-allow-origin")).toBe("*");
    expect(first.headers.get("access-control-expose-headers")).toContain(
      "x-queryhost-cache",
    );
    expect(await first.text()).toBe('{"ok":true}');

    const second = await handlePublicApiQuery(queryRequest(), deps);
    expect(second.status).toBe(429);
    expect(second.headers.get("access-control-allow-origin")).toBe("*");
    expect(second.headers.get("retry-after")).not.toBeNull();
  });

  it("rejects other query methods with an Allow header", async () => {
    const response = await handlePublicApiQuery(
      new Request(`${API_URL}/query`),
      dependencies(upstreamOk),
    );

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST, OPTIONS");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("serves the packaged registry from the games route", async () => {
    const response = handlePublicApiGames(new Request(`${API_URL}/games`));

    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual(
      JSON.parse(JSON.stringify({ games: GAMES })),
    );
    expect(
      handlePublicApiGames(
        new Request(`${API_URL}/games`, { method: "DELETE" }),
      ).status,
    ).toBe(405);
  });

  it("answers unknown API paths with a readable JSON 404", async () => {
    const response = handlePublicApiNotFound(
      new Request(`${API_URL}/typo`, { method: "POST" }),
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Unknown API route." },
    });

    const preflight = handlePublicApiNotFound(
      new Request(`${API_URL}/typo`, { method: "OPTIONS" }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe("*");
    expect(preflight.headers.get("access-control-allow-headers")).toBe(
      "Content-Type",
    );
  });

  it("reads its caller budget under a separate prefix", () => {
    const policy = loadProxyGatePolicy(
      {
        QUERYHOST_WEB_MAX_STARTS_PER_CALLER: "2",
        QUERYHOST_WEB_PUBLIC_API_MAX_STARTS_PER_CALLER: "5",
      },
      "QUERYHOST_WEB_PUBLIC_API_",
    );

    expect(policy.maxStartsPerCaller).toBe(5);
    expect(() =>
      loadProxyGatePolicy(
        {
          QUERYHOST_WEB_PUBLIC_API_MAX_STARTS_PER_CALLER: "9",
          QUERYHOST_WEB_PUBLIC_API_MAX_STARTS_PER_WINDOW: "8",
        },
        "QUERYHOST_WEB_PUBLIC_API_",
      ),
    ).toThrow("QUERYHOST_WEB_PUBLIC_API_MAX_STARTS_PER_CALLER cannot exceed");
  });
});
