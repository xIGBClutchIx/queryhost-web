import { describe, expect, it } from "vitest";

import type { PlaygroundQueryInput } from "../src/lib/playground-contracts.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import { BadgeService } from "../src/server/badge.js";
import {
  handlePreviewRequest,
  loadPreviewGatePolicy,
  PreviewService,
  previewCard,
  rasterizePreview,
} from "../src/server/preview.js";
import { fitText, renderPreviewSvg } from "../src/server/preview-svg.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import type { ProxyFetcher } from "../src/server/public-query.js";

const PREVIEW_URL = "https://query.host/preview";

function gate(maxStartsPerWindow: number): ProxyGate {
  return new ProxyGate({
    maxActive: 4,
    maxStartsPerCaller: maxStartsPerWindow,
    maxStartsPerWindow,
    maxTrackedCallers: 1,
    windowMs: 3_600_000,
  });
}

interface Harness {
  readonly bodies: PlaygroundQueryInput[];
  readonly drawn: string[];
  readonly service: PreviewService;
}

function harness(body: string, maxRenders = 10): Harness {
  const bodies: PlaygroundQueryInput[] = [];
  const drawn: string[] = [];
  const badges = new BadgeService({
    cache: {
      maxEntries: 8,
      maxStaleMs: 600_000,
      offlineTtlMs: 30_000,
      onlineTtlMs: 60_000,
    },
    gate: gate(10),
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
        const sent = init.body;
        if (typeof sent === "string") {
          bodies.push(JSON.parse(sent) as PlaygroundQueryInput);
        }
        return Promise.resolve(
          new Response(body, {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }) satisfies ProxyFetcher,
      queryRunner: () => Promise.reject(new Error("unused")),
    },
  });
  const service = new PreviewService({
    badges,
    games: PLAYGROUND_GAMES,
    gate: gate(maxRenders),
    maxEntries: 2,
    now: () => 1_000,
    rasterize: (svg) => {
      drawn.push(svg);
      return Promise.resolve(new Uint8Array([drawn.length]));
    },
  });
  return { bodies, drawn, service };
}

const ONLINE = JSON.stringify({
  ok: true,
  partial: false,
  server: { name: "§aBlock§lhaven", players: { max: 120, online: 37 } },
});

function request(path: string, method = "GET"): Request {
  return new Request(`${PREVIEW_URL}/${path}`, { method });
}

function params(path: string): { game: string; file: string } {
  const [game = "", file = ""] = new URL(`${PREVIEW_URL}/${path}`).pathname
    .split("/")
    .slice(2);
  return { file, game };
}

function get(service: PreviewService, path: string, method = "GET") {
  return handlePreviewRequest(request(path, method), params(path), service);
}

describe("preview card", () => {
  it("escapes and fits server text", () => {
    const svg = renderPreviewSvg({
      address: "play.example.com",
      gameName: "Rust",
      serverName: `<script>&"${"x".repeat(80)}\u0007`,
      state: { kind: "online", max: 250, online: 187, partial: false },
    });
    expect(svg).toContain("&lt;script&gt;&amp;&quot;");
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("\u0007");
    expect(svg).toContain("…");
    expect(svg).toContain("Online · 187 / 250 players");
    expect(svg).toContain("play.example.com");
  });

  it("states offline and unavailable servers without inventing counts", () => {
    const offline = renderPreviewSvg({
      address: "play.example.com",
      gameName: "Rust",
      state: { kind: "offline" },
    });
    expect(offline).toContain("Offline or unreachable");
    const partial = renderPreviewSvg({
      address: "play.example.com",
      gameName: "Rust",
      state: { kind: "online", partial: true },
    });
    expect(partial).toContain("Online · partial<");
    expect(fitText("abcdef", 10, 0.5, 25)).toBe("abcd…");
    expect(fitText("abc", 10, 0.5, 30)).toBe("abc");
  });

  it("strips Minecraft formatting from server names", () => {
    expect(
      previewCard(
        { game: "minecraft-java", host: "mc.example.com" },
        undefined,
        { kind: "online", name: "§aBlock§lhaven", partial: false },
      ),
    ).toMatchObject({ gameName: "minecraft-java", serverName: "Blockhaven" });
  });

  it("draws a 1200×630 PNG with the vendored fonts", async () => {
    const png = await rasterizePreview(
      renderPreviewSvg({
        address: "play.example.com",
        gameName: "Rust",
        state: { kind: "offline" },
      }),
    );
    const view = Buffer.from(png);
    expect(view.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(view.readUInt32BE(16)).toBe(1_200);
    expect(view.readUInt32BE(20)).toBe(630);
  });
});

describe("preview route", () => {
  it("serves a cached PNG queried with the game's default port", async () => {
    const { bodies, drawn, service } = harness(ONLINE);
    const response = await get(service, "minecraft-java/mc.example.com.png");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/png");
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1]),
    );
    expect(bodies).toEqual([
      {
        game: "minecraft-java",
        host: "mc.example.com",
        mode: "summary",
        port: 25_565,
      },
    ]);
    expect(drawn[0]).toContain("Blockhaven");
    expect(drawn[0]).toContain("Online · 37 / 120 players");

    const head = await get(
      service,
      "minecraft-java/mc.example.com.png",
      "HEAD",
    );
    expect(head.status).toBe(200);
    expect(head.body).toBeNull();
    expect(bodies).toHaveLength(1);
    expect(drawn).toHaveLength(1);
  });

  it("falls back to the site image when drawing is over budget", async () => {
    const { drawn, service } = harness(ONLINE, 1);
    await get(service, "rust/one.example.com.png");
    const response = await get(service, "rust/two.example.com.png");
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/share.png?v=2");
    expect(drawn).toHaveLength(1);
  });

  it("rejects invalid servers and other methods without querying", async () => {
    const { bodies, service } = harness(ONLINE);
    for (const path of [
      "rust/play.example.com.svg",
      "rust/play.example.com:0.png",
      "unknown/play.example.com.png",
      "a2s/203.0.113.10.png",
    ]) {
      expect((await get(service, path)).status, path).toBe(404);
    }
    expect((await get(service, "rust/x.png", "POST")).status).toBe(405);
    expect((await get(service, "rust/x.png", "OPTIONS")).status).toBe(204);
    expect(bodies).toEqual([]);
  });

  it("reads its drawing budget from the environment", () => {
    expect(loadPreviewGatePolicy({}).maxStartsPerWindow).toBe(120);
    expect(
      loadPreviewGatePolicy({
        QUERYHOST_WEB_PREVIEW_MAX_RENDERS_PER_WINDOW: "30",
      }).maxStartsPerWindow,
    ).toBe(30);
  });
});
