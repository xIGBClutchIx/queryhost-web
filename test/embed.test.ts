import { describe, expect, it } from "vitest";

import { BadgeService, badgeStateFromResult } from "../src/server/badge.js";
import {
  EMBED_CONTENT_SECURITY_POLICY,
  handleEmbedRequest,
} from "../src/server/embed.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import type { ProxyFetcher } from "../src/server/public-query.js";

/** A data URL whose header reads as a 64×64 PNG, which is all the icon check reads. */
function pngFavicon(): string {
  const header = new Uint8Array(24);
  header.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  header.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  header.set([0, 0, 0, 64, 0, 0, 0, 64], 16);
  return `data:image/png;base64,${Buffer.from(header).toString("base64")}`;
}

const FAVICON = pngFavicon();

const ONLINE_BODY = JSON.stringify({
  data: { favicon: FAVICON },
  game: "minecraft-java",
  ok: true,
  partial: false,
  server: {
    name: `§aExample ${String.fromCodePoint(0x202e)}SMP <b>`,
    players: { max: 40, online: 12 },
  },
});

function harness(body: string): {
  readonly calls: RequestInit[];
  readonly service: BadgeService;
} {
  const calls: RequestInit[] = [];
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

function embedRequest(
  game: string,
  target: string,
  search = "",
  init: RequestInit = {},
): [Request, { game: string; target: string }] {
  return [
    new Request(`https://query.host/embed/${game}/${target}${search}`, {
      headers: { "x-real-ip": "203.0.113.20" },
      ...init,
    }),
    { game, target },
  ];
}

describe("embed card", () => {
  it("keeps validated favicons in badge state", () => {
    expect(badgeStateFromResult(ONLINE_BODY)).toMatchObject({
      favicon: FAVICON,
    });
  });

  it("renders a framable, script-free card from the badge cache", async () => {
    const { calls, service } = harness(ONLINE_BODY);
    const response = await handleEmbedRequest(
      ...embedRequest("minecraft", "mc.example.com"),
      service,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/html; charset=utf-8",
    );
    expect(response.headers.get("content-security-policy")).toBe(
      EMBED_CONTENT_SECURITY_POLICY,
    );
    expect(EMBED_CONTENT_SECURITY_POLICY).toContain("frame-ancestors *");
    expect(EMBED_CONTENT_SECURITY_POLICY).toContain("default-src 'none'");
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    const html = await response.text();
    expect(html).not.toMatch(/<script|javascript:|\son\w+=/iu);
    expect(html).toContain('<meta name="robots" content="noindex">');
    expect(html).toContain('<meta http-equiv="refresh" content="60">');
    expect(html).toContain(
      'href="/minecraft-java/mc.example.com" target="_blank" rel="noopener"',
    );
    // Formatting codes and bidi controls are removed, and markup is escaped.
    expect(html).toContain(">Example SMP &lt;b&gt;</span>");
    expect(html).toContain("mc.example.com · Minecraft: Java Edition");
    expect(html).toContain(">12/40</span>");
    expect(html).toContain(`src="${FAVICON}"`);
    expect(calls).toHaveLength(1);
  });

  it("shares the badge's cached query", async () => {
    const { calls, service } = harness(ONLINE_BODY);
    await service.resolve({
      game: "minecraft-java",
      host: "mc.example.com",
      mode: "summary",
    });
    const response = await handleEmbedRequest(
      ...embedRequest("minecraft-java", "mc.example.com"),
      service,
    );
    expect(calls).toHaveLength(1);
    // The favicon is kept beside the cached result and still shown on a hit.
    expect(await response.text()).toContain(`src="${FAVICON}"`);
  });

  it("follows the requested theme", async () => {
    const { service } = harness(ONLINE_BODY);
    const light = await (
      await handleEmbedRequest(
        ...embedRequest("minecraft", "mc.example.com", "?theme=light"),
        service,
      )
    ).text();
    expect(light).toContain("color-scheme:light;");
    const auto = await (
      await handleEmbedRequest(
        ...embedRequest("minecraft", "mc.example.com", "?theme=auto"),
        service,
      )
    ).text();
    expect(auto).toContain("@media (prefers-color-scheme:light)");
  });

  it("shows offline servers by address", async () => {
    const { service } = harness('{"ok":false,"error":{"code":"TIMEOUT"}}');
    const html = await (
      await handleEmbedRequest(...embedRequest("rust", "203.0.113.5"), service)
    ).text();
    expect(html).toContain(">203.0.113.5</span>");
    expect(html).toContain("Offline");
    expect(html).toContain('href="/rust/203.0.113.5"');
  });

  it("draws invalid servers without echoing the path or querying", async () => {
    const { calls, service } = harness(ONLINE_BODY);
    const response = await handleEmbedRequest(
      ...embedRequest("minecraft", "<b>evil</b>"),
      service,
    );
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("Invalid server");
    expect(html).not.toContain("evil");
    expect(calls).toHaveLength(0);
  });

  it("answers HEAD, 304, and other methods", async () => {
    const { service } = harness(ONLINE_BODY);
    const head = await handleEmbedRequest(
      ...embedRequest("minecraft", "mc.example.com", "", { method: "HEAD" }),
      service,
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    const etag = head.headers.get("etag") ?? "";
    const cached = await handleEmbedRequest(
      ...embedRequest("minecraft", "mc.example.com", "", {
        headers: { "If-None-Match": etag, "x-real-ip": "203.0.113.20" },
      }),
      service,
    );
    expect(cached.status).toBe(304);
    const post = await handleEmbedRequest(
      ...embedRequest("minecraft", "mc.example.com", "", { method: "POST" }),
      service,
    );
    expect(post.status).toBe(405);
  });
});
