import { describe, expect, it } from "vitest";

import { badgeMarkdown, badgeUrl } from "../src/lib/badge-url.js";
import type { PlaygroundQueryInput } from "../src/lib/playground-contracts.js";
import { renderBadgeSvg } from "../src/server/badge-svg.js";
import {
  BadgeService,
  badgeStateFromResult,
  handleBadgeRequest,
  loadBadgeGatePolicy,
  parseBadgeRequest,
  type BadgeCachePolicy,
} from "../src/server/badge.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import type { ProxyFetcher } from "../src/server/public-query.js";

const BADGE_URL = "https://query.host/api/v1/badge";
const POLICY: BadgeCachePolicy = {
  maxEntries: 2,
  maxStaleMs: 600_000,
  offlineTtlMs: 30_000,
  onlineTtlMs: 60_000,
};

const ONLINE_BODY = JSON.stringify({
  ok: true,
  partial: false,
  server: { players: { online: 12, max: 40 } },
});

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: { "Content-Type": "application/json" },
    status,
  });
}

interface Harness {
  readonly calls: RequestInit[];
  readonly service: BadgeService;
  readonly setNow: (value: number) => void;
}

interface HarnessLimits {
  readonly maxStartsPerCaller?: number;
  readonly maxNewStartsPerWindow?: number;
}

function harness(
  fetcher: (call: number) => Promise<Response>,
  maxStartsPerWindow = 10,
  limits: HarnessLimits = {},
): Harness {
  const calls: RequestInit[] = [];
  let now = 1_000;
  const service = new BadgeService({
    cache: POLICY,
    gate: new ProxyGate({
      maxActive: 4,
      maxStartsPerCaller: limits.maxStartsPerCaller ?? maxStartsPerWindow,
      maxStartsPerWindow,
      maxTrackedCallers: 16,
      windowMs: 3_600_000,
    }),
    ...(limits.maxNewStartsPerWindow === undefined
      ? {}
      : { maxNewStartsPerWindow: limits.maxNewStartsPerWindow }),
    now: () => now,
    query: {
      config: {
        maxBodyBytes: 2_048,
        target: {
          apiBaseUrl: "http://api.railway.internal:3000",
          apiOriginToken: "a".repeat(32),
          kind: "hosted",
        },
        upstreamTimeoutMs: 7_000,
      },
      fetcher: ((_url, init) => {
        calls.push(init);
        return fetcher(calls.length);
      }) satisfies ProxyFetcher,
      queryRunner: () => Promise.reject(new Error("unused")),
    },
  });
  return {
    calls,
    service,
    setNow: (value) => {
      now = value;
    },
  };
}

const MINECRAFT: PlaygroundQueryInput = {
  game: "minecraft-java",
  host: "mc.example.com",
  mode: "summary",
};

function badgeRequest(path: string, method = "GET"): Request {
  return new Request(`${BADGE_URL}/${path}`, {
    headers: { "x-real-ip": "203.0.113.20" },
    method,
  });
}

function routeParams(path: string): { game: string; file: string } {
  const [game = "", file = ""] = new URL(`${BADGE_URL}/${path}`).pathname
    .slice("/api/v1/badge/".length)
    .split("/");
  return { file: decodeURIComponent(file), game };
}

describe("badge paths", () => {
  const empty = new URLSearchParams();

  it("reads a host, an optional port, and a query port", () => {
    expect(parseBadgeRequest("minecraft", "mc.example.com.svg", empty)).toEqual(
      MINECRAFT,
    );
    expect(
      parseBadgeRequest(
        "rust",
        "203.0.113.5:28015.svg",
        new URLSearchParams("queryPort=28016"),
      ),
    ).toEqual({
      game: "rust",
      host: "203.0.113.5",
      mode: "summary",
      port: 28015,
      queryPort: 28016,
    });
  });

  it("canonicalizes aliases and host case like the query API", () => {
    expect(parseBadgeRequest("mc", "MC.Example.com.svg", empty)).toEqual(
      MINECRAFT,
    );
  });

  it("accepts bracketed and bare IPv6 literals", () => {
    expect(
      parseBadgeRequest("rust", "[2001:db8::1]:28015.svg", empty),
    ).toMatchObject({ host: "2001:db8::1", port: 28015 });
    expect(parseBadgeRequest("minecraft", "2001:db8::1.svg", empty)).toEqual({
      ...MINECRAFT,
      host: "2001:db8::1",
    });
  });

  it("requires the .svg suffix", () => {
    expect(
      parseBadgeRequest("minecraft", "mc.example.com", empty),
    ).toBeUndefined();
  });

  it("rejects unknown games, bad ports, and URL syntax", () => {
    expect(() =>
      parseBadgeRequest("not-a-game", "mc.example.com.svg", empty),
    ).toThrow("game must be");
    expect(() =>
      parseBadgeRequest("minecraft", "mc.example.com:0.svg", empty),
    ).toThrow("port must be");
    expect(() =>
      parseBadgeRequest("minecraft", "mc.example.com:abc.svg", empty),
    ).toThrow("port must be");
    expect(() =>
      parseBadgeRequest(
        "minecraft",
        "mc.example.com.svg",
        new URLSearchParams("queryPort=x"),
      ),
    ).toThrow("queryPort must be");
    expect(() =>
      parseBadgeRequest("minecraft", "user@mc.example.com.svg", empty),
    ).toThrow("host must be");
    expect(() => parseBadgeRequest("a2s", "203.0.113.5.svg", empty)).toThrow(
      "port is required",
    );
  });
});

describe("badge results", () => {
  it("keeps unconfirmed player counts out of the state", () => {
    expect(badgeStateFromResult(ONLINE_BODY)).toEqual({
      kind: "online",
      max: 40,
      online: 12,
      partial: false,
    });
    expect(
      badgeStateFromResult('{"ok":true,"partial":true,"server":{}}'),
    ).toEqual({ kind: "online", partial: true });
    expect(badgeStateFromResult('{"ok":false}')).toEqual({ kind: "offline" });
  });

  it("keeps a bounded, non-blank server name for link previews", () => {
    const named = (name: string): string =>
      JSON.stringify({ ok: true, partial: false, server: { name } });
    expect(badgeStateFromResult(named("Example Vanilla"))).toEqual({
      kind: "online",
      name: "Example Vanilla",
      partial: false,
    });
    expect(badgeStateFromResult(named("   "))).toEqual({
      kind: "online",
      partial: false,
    });
    const long = badgeStateFromResult(named("x".repeat(1_000)));
    expect(long?.kind === "online" ? long.name?.length : undefined).toBe(256);
  });

  it("rejects bodies that are not query results", () => {
    expect(badgeStateFromResult("not json")).toBeUndefined();
    expect(badgeStateFromResult("[]")).toBeUndefined();
    expect(
      badgeStateFromResult('{"error":{"code":"OVERLOADED"}}'),
    ).toBeUndefined();
  });
});

describe("badge SVG", () => {
  it("shows the game name and player count", () => {
    const svg = renderBadgeSvg("Minecraft", {
      kind: "online",
      max: 1_000,
      online: 12,
      partial: false,
    });
    expect(svg).toContain(">Minecraft</text>");
    expect(svg).toContain(">12/1,000 online</text>");
    expect(svg).toContain('aria-label="Minecraft, 12/1,000 online"');
    expect(svg).toContain('fill="#55d7ba"');
  });

  it("never shows an unconfirmed maximum as zero", () => {
    expect(
      renderBadgeSvg("Rust", { kind: "online", online: 3, partial: true }),
    ).toContain(">3 online</text>");
    expect(
      renderBadgeSvg("Rust", { kind: "online", partial: false }),
    ).toContain(">online</text>");
  });

  it("escapes text and references nothing external", () => {
    const svg = renderBadgeSvg('<script>&"', { kind: "offline" });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(svg).not.toMatch(/href|<style|<script|@import/u);
  });
});

describe("badge cache", () => {
  it("reuses a result until its TTL and then refreshes it", async () => {
    const { calls, service, setNow } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    await expect(service.resolve(MINECRAFT)).resolves.toMatchObject({
      maxAgeSeconds: 60,
      state: { kind: "online", online: 12 },
    });
    setNow(31_000);
    await expect(service.resolve(MINECRAFT)).resolves.toMatchObject({
      maxAgeSeconds: 30,
    });
    expect(calls).toHaveLength(1);
    setNow(61_000);
    await service.resolve(MINECRAFT);
    expect(calls).toHaveLength(2);
  });

  it("sends one summary query for concurrent viewers", async () => {
    let finish: (response: Response) => void = () => undefined;
    const { calls, service } = harness(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve;
        }),
    );
    const first = service.resolve(MINECRAFT);
    const second = service.resolve(MINECRAFT);
    finish(jsonResponse(ONLINE_BODY));
    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
    const body = calls[0]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : body).toEqual(
      MINECRAFT,
    );
  });

  it("caches offline results for the shorter TTL", async () => {
    const { service } = harness(() =>
      Promise.resolve(jsonResponse('{"ok":false}')),
    );
    await expect(service.resolve(MINECRAFT)).resolves.toEqual({
      maxAgeSeconds: 30,
      state: { kind: "offline" },
    });
  });

  it("serves the last known state when the budget is spent or upstream fails", async () => {
    const { calls, service, setNow } = harness(
      (call) =>
        Promise.resolve(
          call === 1
            ? jsonResponse(ONLINE_BODY)
            : jsonResponse('{"error":{"code":"OVERLOADED"}}', 503),
        ),
      2,
    );
    await service.resolve(MINECRAFT);
    setNow(70_000);
    await expect(service.resolve(MINECRAFT)).resolves.toMatchObject({
      maxAgeSeconds: 15,
      state: { kind: "online", online: 12 },
    });
    // The failure is remembered, so the next viewer waits for it to expire.
    setNow(80_000);
    // The budget is now spent, so no third query starts.
    await expect(service.resolve(MINECRAFT)).resolves.toMatchObject({
      state: { kind: "online", online: 12 },
    });
    expect(calls).toHaveLength(2);
  });

  it("reports unavailable without a recent result to fall back on", async () => {
    const { service, setNow } = harness((call) =>
      call === 1
        ? Promise.resolve(jsonResponse(ONLINE_BODY))
        : Promise.reject(new Error("socket hang up")),
    );
    await expect(
      service.resolve({ ...MINECRAFT, host: "other.example.com" }),
    ).resolves.toMatchObject({ state: { kind: "online" } });
    setNow(1_000 + POLICY.maxStaleMs + 1);
    await expect(
      service.resolve({ ...MINECRAFT, host: "other.example.com" }),
    ).resolves.toEqual({ maxAgeSeconds: 15, state: { kind: "unavailable" } });
  });

  it("remembers failed queries briefly instead of retrying per viewer", async () => {
    const { calls, service, setNow } = harness(() =>
      Promise.resolve(jsonResponse('{"error":{"code":"OVERLOADED"}}', 429)),
    );
    await expect(service.resolve(MINECRAFT)).resolves.toEqual({
      maxAgeSeconds: 15,
      state: { kind: "unavailable" },
    });
    setNow(11_000);
    await expect(service.resolve(MINECRAFT)).resolves.toEqual({
      maxAgeSeconds: 5,
      state: { kind: "unavailable" },
    });
    expect(calls).toHaveLength(1);
    setNow(16_000);
    await service.resolve(MINECRAFT);
    expect(calls).toHaveLength(2);
  });

  it("remembers thrown and timed-out queries the same way", async () => {
    const { calls, service } = harness(() =>
      Promise.reject(new Error("timeout")),
    );
    await service.resolve(MINECRAFT);
    await service.resolve(MINECRAFT);
    expect(calls).toHaveLength(1);
  });

  it("caps cache misses per caller", async () => {
    const { calls, service } = harness(
      () => Promise.resolve(jsonResponse(ONLINE_BODY)),
      60,
      { maxStartsPerCaller: 2 },
    );
    for (const host of ["a.example.com", "b.example.com", "c.example.com"]) {
      await service.resolve({ ...MINECRAFT, host }, "198.51.100.1");
    }
    expect(calls).toHaveLength(2);
    await expect(
      service.resolve({ ...MINECRAFT, host: "c.example.com" }, "198.51.100.2"),
    ).resolves.toMatchObject({ state: { kind: "online" } });
    expect(calls).toHaveLength(3);
  });

  it("keeps part of the budget for refreshing badges already cached", async () => {
    const { calls, service, setNow } = harness(
      () => Promise.resolve(jsonResponse(ONLINE_BODY)),
      3,
      { maxNewStartsPerWindow: 2 },
    );
    await service.resolve({ ...MINECRAFT, host: "popular.example.com" }, "a");
    await service.resolve({ ...MINECRAFT, host: "new-1.example.com" }, "b");
    // New servers have used their share, so this one is turned away.
    await expect(
      service.resolve({ ...MINECRAFT, host: "new-2.example.com" }, "c"),
    ).resolves.toMatchObject({ state: { kind: "unavailable" } });
    expect(calls).toHaveLength(2);
    // The popular badge expires and still refreshes from the reserve.
    setNow(62_000);
    await service.resolve({ ...MINECRAFT, host: "popular.example.com" }, "d");
    expect(calls).toHaveLength(3);
  });

  it("shares one entry for a missing and an explicit default port", async () => {
    const { calls, service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    const rust: PlaygroundQueryInput = {
      game: "rust",
      host: "203.0.113.5",
      mode: "summary",
    };
    await service.resolve(rust);
    await service.resolve({ ...rust, port: 28015 });
    expect(calls).toHaveLength(1);
  });

  it("keeps Minecraft: Java Edition's SRV lookup separate from its default port", async () => {
    const { calls, service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    await service.resolve(MINECRAFT);
    await service.resolve({ ...MINECRAFT, port: 25565 });
    expect(calls).toHaveLength(2);
    const body = calls[0]?.body;
    expect(typeof body === "string" ? JSON.parse(body) : body).toEqual(
      MINECRAFT,
    );
  });

  it("caches blocked targets as invalid", async () => {
    const { service } = harness(() =>
      Promise.resolve(
        jsonResponse('{"ok":false,"error":{"code":"TARGET_BLOCKED"}}'),
      ),
    );
    await expect(service.resolve(MINECRAFT)).resolves.toEqual({
      maxAgeSeconds: 30,
      state: { kind: "invalid" },
    });
  });

  it("evicts the least recently stored servers beyond its bound", async () => {
    const { service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    for (const host of ["a.example.com", "b.example.com", "c.example.com"]) {
      await service.resolve({ ...MINECRAFT, host });
    }
    expect(service.size).toBe(POLICY.maxEntries);
  });
});

describe("badge route", () => {
  it("serves a cacheable, locked-down SVG", async () => {
    const { service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    const path = "minecraft/mc.example.com.svg";
    const response = await handleBadgeRequest(
      badgeRequest(path),
      routeParams(path),
      service,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "image/svg+xml; charset=utf-8",
    );
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.text()).toContain(">Minecraft: Java Edition</text>");
  });

  it("answers HEAD without a body and rejects other methods", async () => {
    const { service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    const path = "minecraft/mc.example.com.svg";
    const head = await handleBadgeRequest(
      badgeRequest(path, "HEAD"),
      routeParams(path),
      service,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    const post = await handleBadgeRequest(
      badgeRequest(path, "POST"),
      routeParams(path),
      service,
    );
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("draws an uncached invalid badge without querying", async () => {
    const { calls, service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    const path = "not-a-game/mc.example.com.svg";
    const response = await handleBadgeRequest(
      badgeRequest(path),
      routeParams(path),
      service,
    );
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(await response.text()).toContain(">invalid server</text>");
    expect(calls).toHaveLength(0);
  });

  it("returns a JSON 404 for paths without .svg", async () => {
    const { service } = harness(() =>
      Promise.resolve(jsonResponse(ONLINE_BODY)),
    );
    const path = "minecraft/mc.example.com";
    const response = await handleBadgeRequest(
      badgeRequest(path),
      routeParams(path),
      service,
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("badge budget", () => {
  it("caps each caller and keeps a reserve for refreshes", () => {
    expect(loadBadgeGatePolicy({})).toMatchObject({
      maxNewStartsPerWindow: 40,
      maxStartsPerCaller: 15,
      maxStartsPerWindow: 60,
    });
    expect(
      loadBadgeGatePolicy({
        QUERYHOST_WEB_BADGE_MAX_STARTS_PER_CALLER: "30",
        QUERYHOST_WEB_BADGE_MAX_STARTS_PER_WINDOW: "120",
        QUERYHOST_WEB_BADGE_REFRESH_RESERVE: "0",
      }),
    ).toMatchObject({
      maxNewStartsPerWindow: 120,
      maxStartsPerCaller: 30,
      maxStartsPerWindow: 120,
    });
  });

  it("validates its settings", () => {
    expect(() =>
      loadBadgeGatePolicy({ QUERYHOST_WEB_BADGE_MAX_ACTIVE: "0" }),
    ).toThrow(RangeError);
    expect(() =>
      loadBadgeGatePolicy({ QUERYHOST_WEB_BADGE_REFRESH_RESERVE: "60" }),
    ).toThrow(RangeError);
    expect(() =>
      loadBadgeGatePolicy({ QUERYHOST_WEB_BADGE_MAX_STARTS_PER_CALLER: "61" }),
    ).toThrow(RangeError);
  });
});

describe("badge URLs", () => {
  it("round-trips through the badge route parser", () => {
    const cases: PlaygroundQueryInput[] = [
      { game: "minecraft-java", host: "mc.example.com" },
      { game: "rust", host: "203.0.113.5", port: 28015, queryPort: 28016 },
      { game: "rust", host: "2001:db8::1", port: 28015 },
    ];
    for (const input of cases) {
      const url = badgeUrl("https://query.host", input);
      const path = url.pathname.slice("/api/v1/badge/".length);
      const params = routeParams(path);
      expect(
        parseBadgeRequest(params.game, params.file, url.searchParams),
      ).toEqual({ ...input, mode: "summary" });
    }
  });

  it("writes Markdown that links the badge to the playground", () => {
    expect(
      badgeMarkdown(
        "Minecraft",
        new URL("https://query.host/api/v1/badge/minecraft/mc.example.com.svg"),
        new URL("https://query.host/?game=minecraft&host=mc.example.com"),
      ),
    ).toBe(
      "[![Minecraft server status](https://query.host/api/v1/badge/minecraft/mc.example.com.svg)](https://query.host/?game=minecraft&host=mc.example.com)",
    );
  });
});
