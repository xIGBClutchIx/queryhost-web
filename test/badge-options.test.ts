import { describe, expect, it } from "vitest";

import {
  badgeEndpointUrl,
  badgeLabelText,
  badgeUrl,
  DEFAULT_BADGE_OPTIONS,
  embedUrl,
  parseBadgeOptions,
} from "../src/lib/badge-url.js";
import type { PlaygroundQueryInput } from "../src/lib/playground-contracts.js";
import { renderBadgeSvg } from "../src/server/badge-svg.js";
import {
  BadgeService,
  badgeStateFromResult,
  handleBadgeRequest,
} from "../src/server/badge.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import type { ProxyFetcher } from "../src/server/public-query.js";

const BADGE_URL = "https://query.host/api/v1/badge";
// Written as code points so no invisible character sits in this source.
const RLO = String.fromCodePoint(0x202e);
const ZWSP = String.fromCodePoint(0x200b);
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const ONLINE_BODY = JSON.stringify({
  ok: true,
  partial: false,
  server: { players: { online: 12, max: 40 } },
});

function service(
  body: string,
  calls: RequestInit[] = [],
): { readonly calls: RequestInit[]; readonly service: BadgeService } {
  return {
    calls,
    service: new BadgeService({
      cache: {
        maxEntries: 8,
        maxStaleMs: 600_000,
        offlineTtlMs: 30_000,
        onlineTtlMs: 60_000,
      },
      gate: new ProxyGate({
        maxActive: 4,
        maxStartsPerCaller: 10,
        maxStartsPerWindow: 10,
        maxTrackedCallers: 16,
        windowMs: 60_000,
      }),
      now: () => 1_000,
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
          return Promise.resolve(
            new Response(body, {
              headers: { "Content-Type": "application/json" },
            }),
          );
        }) satisfies ProxyFetcher,
        queryRunner: () => Promise.reject(new Error("unused")),
      },
    }),
  };
}

async function get(
  path: string,
  headers: Record<string, string> = {},
  body = ONLINE_BODY,
): Promise<{ readonly calls: RequestInit[]; readonly response: Response }> {
  const { calls, service: badges } = service(body);
  const url = new URL(`${BADGE_URL}/${path}`);
  const [game = "", file = ""] = url.pathname
    .slice("/api/v1/badge/".length)
    .split("/");
  const response = await handleBadgeRequest(
    new Request(url, { headers: { "x-real-ip": "203.0.113.20", ...headers } }),
    { file: decodeURIComponent(file), game },
    badges,
  );
  return { calls, response };
}

describe("badge rendering options", () => {
  const ONLINE = {
    kind: "online",
    map: "de_dust2",
    max: 40,
    online: 12,
    partial: false,
  } as const;

  it("keeps the default badge byte-identical", () => {
    expect(
      renderBadgeSvg("Minecraft: Java Edition", {
        kind: "online",
        max: 40,
        online: 12,
        partial: false,
      }),
    ).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="236" height="20" viewBox="0 0 236 20" role="img" aria-label="Minecraft: Java Edition, 12/40 online"><title>Minecraft: Java Edition, 12/40 online</title><clipPath id="r"><rect width="236" height="20" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="141" height="20" fill="#10191d"/><rect x="141" width="95" height="20" fill="#55d7ba"/></g><circle cx="151" cy="10" r="3" fill="#04201a"/><g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="7" y="14" fill="#dce7e4" textLength="127" lengthAdjust="spacingAndGlyphs">Minecraft: Java Edition</text><text x="158" y="14" fill="#04201a" textLength="71" lengthAdjust="spacingAndGlyphs">12/40 online</text></g></svg>',
    );
    expect(renderBadgeSvg("Rust", { kind: "offline" })).toBe(
      '<svg xmlns="http://www.w3.org/2000/svg" width="98" height="20" viewBox="0 0 98 20" role="img" aria-label="Rust, offline"><title>Rust, offline</title><clipPath id="r"><rect width="98" height="20" rx="4"/></clipPath><g clip-path="url(#r)"><rect width="39" height="20" fill="#10191d"/><rect x="39" width="59" height="20" fill="#364a50"/></g><circle cx="49" cy="10" r="3" fill="#f3f8f6"/><g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="7" y="14" fill="#dce7e4" textLength="25" lengthAdjust="spacingAndGlyphs">Rust</text><text x="56" y="14" fill="#f3f8f6" textLength="35" lengthAdjust="spacingAndGlyphs">offline</text></g></svg>',
    );
    expect(
      renderBadgeSvg("Rust", { kind: "offline" }, DEFAULT_BADGE_OPTIONS),
    ).toBe(renderBadgeSvg("Rust", { kind: "offline" }));
  });

  it("draws square and for-the-badge shapes", () => {
    const square = renderBadgeSvg("Rust", ONLINE, { style: "flat-square" });
    expect(square).not.toContain("clipPath");
    expect(square).toContain('height="20"');
    const big = renderBadgeSvg("Rust", ONLINE, { style: "for-the-badge" });
    expect(big).toContain('height="28"');
    expect(big).toContain(">RUST</text>");
    expect(big).toContain(">12/40 ONLINE</text>");
    expect(big).toContain('font-weight="bold"');
    expect(big).toContain('aria-label="Rust, 12/40 online"');
  });

  it("shows status only, or players with an escaped, shortened map", () => {
    expect(renderBadgeSvg("Rust", ONLINE, { show: "status" })).toContain(
      ">online</text>",
    );
    expect(renderBadgeSvg("Rust", ONLINE, { show: "players-map" })).toContain(
      ">12/40 online · de_dust2</text>",
    );
    const hostile = renderBadgeSvg(
      "Rust",
      { ...ONLINE, map: '<script>"x"</script>'.repeat(4) },
      { show: "players-map" },
    );
    expect(hostile).not.toContain("<script>");
    expect(hostile).toContain("&lt;script&gt;&quot;x&quot;&lt;/script&gt;");
    expect(hostile).toContain("…</text>");
    expect(
      renderBadgeSvg("Rust", { kind: "offline" }, { show: "players-map" }),
    ).toContain(">offline</text>");
  });

  it("draws light and automatic themes", () => {
    const light = renderBadgeSvg("Rust", ONLINE, { theme: "light" });
    expect(light).toContain('fill="#e4ecea"');
    expect(light).toContain('fill="#137a63"');
    expect(light).not.toContain("<style");
    const auto = renderBadgeSvg("Rust", ONLINE, { theme: "auto" });
    expect(auto).toContain('fill="#10191d"');
    expect(auto).toContain("@media (prefers-color-scheme:light)");
    expect(auto).toContain(".sb{fill:#137a63}");
    expect(auto).not.toMatch(/href|<script|@import|url\(http/u);
  });
});

describe("badge options", () => {
  it("reads closed sets and falls back on unknown values", () => {
    expect(parseBadgeOptions(new URLSearchParams())).toEqual(
      DEFAULT_BADGE_OPTIONS,
    );
    expect(
      parseBadgeOptions(
        new URLSearchParams(
          "style=for-the-badge&show=players-map&theme=auto&label=My%20Server",
        ),
      ),
    ).toEqual({
      label: "My Server",
      show: "players-map",
      style: "for-the-badge",
      theme: "auto",
    });
    expect(
      parseBadgeOptions(
        new URLSearchParams("style=plastic&show=everything&theme=neon&x=1"),
      ),
    ).toEqual(DEFAULT_BADGE_OPTIONS);
  });

  it("accepts short, plain labels in any script", () => {
    expect(badgeLabelText("  Survival   SMP #2 ")).toBe("Survival SMP #2");
    expect(badgeLabelText("Сервер (EU): 1.21!")).toBe("Сервер (EU): 1.21!");
    expect(badgeLabelText("日本サーバー")).toBe("日本サーバー");
    expect(badgeLabelText("x".repeat(32))).toBe("x".repeat(32));
  });

  it("strips control, bidi, and zero-width characters", () => {
    expect(badgeLabelText(`Safe${RLO}txt.exe`)).toBe("Safetxt.exe");
    expect(
      badgeLabelText(`A${ZWSP}b${String.fromCodePoint(0)}c${LINE_SEPARATOR}d`),
    ).toBe("Abcd");
    expect(badgeLabelText(`${LRI}${PDI}`)).toBeUndefined();
  });

  it("rejects long labels, URLs, addresses, and markup", () => {
    expect(badgeLabelText("x".repeat(33))).toBeUndefined();
    expect(badgeLabelText("https://evil.example")).toBeUndefined();
    expect(badgeLabelText("evil.example/login")).toBeUndefined();
    expect(badgeLabelText("admin@example.com")).toBeUndefined();
    expect(badgeLabelText('<img src="x">')).toBeUndefined();
    expect(badgeLabelText("100%")).toBeUndefined();
    expect(badgeLabelText("🎮 Games")).toBeUndefined();
    expect(badgeLabelText("   ")).toBeUndefined();
    expect(badgeLabelText("a".repeat(10_000))).toBeUndefined();
  });

  it("writes only non-default options into badge URLs", () => {
    const rust: PlaygroundQueryInput = {
      game: "rust",
      host: "203.0.113.5",
      port: 28015,
    };
    expect(
      badgeUrl("https://query.host", rust, DEFAULT_BADGE_OPTIONS).href,
    ).toBe("https://query.host/api/v1/badge/rust/203.0.113.5:28015.svg");
    expect(
      badgeUrl("https://query.host", rust, {
        label: "My Rust",
        show: "status",
        style: "flat-square",
        theme: "light",
      }).href,
    ).toBe(
      "https://query.host/api/v1/badge/rust/203.0.113.5:28015.svg?style=flat-square&show=status&theme=light&label=My+Rust",
    );
    expect(
      badgeEndpointUrl("https://query.host", rust, {
        label: "bad/label",
        theme: "light",
      }).href,
    ).toBe("https://query.host/api/v1/badge/rust/203.0.113.5:28015.json");
    expect(embedUrl("https://query.host", rust, "auto").href).toBe(
      "https://query.host/embed/rust/203.0.113.5:28015?theme=auto",
    );
  });
});

describe("badge route options and validation", () => {
  it("draws a custom label and options", async () => {
    const { response } = await get(
      "rust/203.0.113.5:28015.svg?label=My%20Rust&style=flat-square",
    );
    const svg = await response.text();
    expect(svg).toContain(">My Rust</text>");
    expect(svg).not.toContain("clipPath");
  });

  it("ignores an unsafe label and shows the game name", async () => {
    const { response } = await get(
      "rust/203.0.113.5:28015.svg?label=%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    );
    const svg = await response.text();
    expect(svg).toContain(">Rust</text>");
    expect(svg).not.toContain("script");
  });

  it("answers a matching If-None-Match with an empty 304", async () => {
    const path = "minecraft/mc.example.com.svg";
    const first = await get(path);
    const etag = first.response.headers.get("etag") ?? "";
    expect(etag).toMatch(/^W\/".+"$/u);
    const second = await get(path, { "If-None-Match": etag });
    expect(second.response.status).toBe(304);
    expect(second.response.body).toBeNull();
    expect(second.response.headers.get("etag")).toBe(etag);
    expect(second.response.headers.get("cache-control")).toBe(
      "public, max-age=60",
    );
    const other = await get(path, { "If-None-Match": 'W/"stale"' });
    expect(other.response.status).toBe(200);
  });

  it("serves a shields.io endpoint body from the same query", async () => {
    const { calls, response } = await get(
      "minecraft/mc.example.com.json?style=for-the-badge&show=status&theme=light",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(await response.json()).toEqual({
      cacheSeconds: 60,
      color: "55d7ba",
      isError: false,
      label: "Minecraft: Java Edition",
      labelColor: "10191d",
      message: "online",
      schemaVersion: 1,
      style: "for-the-badge",
    });
    expect(calls).toHaveLength(1);
  });

  it("marks invalid endpoint badges as errors", async () => {
    const { calls, response } = await get("not-a-game/mc.example.com.json");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      isError: true,
      message: "invalid server",
    });
    expect(calls).toHaveLength(0);
  });

  it("draws a blocked target as invalid", async () => {
    const { response } = await get(
      "minecraft/mc.example.com.svg",
      {},
      '{"ok":false,"error":{"code":"TARGET_BLOCKED"}}',
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toContain(">invalid server</text>");
  });

  it("exposes its ETag and answers CORS preflight", async () => {
    const { response } = await get("minecraft/mc.example.com.svg");
    expect(response.headers.get("access-control-expose-headers")).toBe("ETag");
    const preflight = await handleBadgeRequest(
      new Request(`${BADGE_URL}/minecraft/mc.example.com.json`, {
        method: "OPTIONS",
      }),
      { file: "mc.example.com.json", game: "minecraft" },
      service(ONLINE_BODY).service,
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, OPTIONS",
    );
  });
});

describe("badge result fields", () => {
  it("keeps a map without control characters", () => {
    expect(
      badgeStateFromResult(
        JSON.stringify({
          game: "minecraft-java",
          ok: true,
          partial: false,
          server: { map: `  de_${RLO}dust\n2 ` },
        }),
      ),
    ).toEqual({ kind: "online", map: "de_dust2", partial: false });
  });

  it("keeps only valid, bounded Minecraft favicons", () => {
    const favicon = (value: string, game = "minecraft-java") =>
      badgeStateFromResult(
        JSON.stringify({
          data: { favicon: value },
          game,
          ok: true,
          partial: false,
        }),
      );
    expect(favicon("data:image/png;base64,AAAA")).toEqual({
      kind: "online",
      partial: false,
    });
    expect(favicon(`data:image/png;base64,${"A".repeat(40_000)}`)).toEqual({
      kind: "online",
      partial: false,
    });
  });

  it("treats other failures as offline", () => {
    expect(
      badgeStateFromResult('{"ok":false,"error":{"code":"TIMEOUT"}}'),
    ).toEqual({ kind: "offline" });
  });
});
