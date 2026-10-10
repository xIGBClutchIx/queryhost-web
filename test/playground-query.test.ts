import { describe, expect, it } from "vitest";

import type {
  PlaygroundProxyErrorResponse,
  PlaygroundQueryResponse,
} from "../src/lib/playground-contracts.js";
import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import {
  requestPlaygroundDetect,
  requestPlaygroundQuery,
  type PlaygroundFetcher,
} from "../src/lib/playground-query.js";

const INPUT = {
  game: "minecraft-java",
  host: "play.example.com",
  mode: "summary",
  timeoutMs: 5_000,
} as const;

describe("playground query client", () => {
  it("posts to the same-origin route and preserves a query result", async () => {
    const controller = new AbortController();
    const body: PlaygroundQueryResponse = {
      cache: { ageMs: 0, status: "miss", ttlMs: 10_000 },
      data: {},
      durationMs: 42,
      game: "minecraft-java",
      ok: true,
      partial: false,
      server: { name: "Example" },
      sources: [],
      warnings: [],
    };
    let requestInput: string | URL | undefined;
    let requestInit: RequestInit | undefined;
    const fetcher: PlaygroundFetcher = (input, init) => {
      requestInput = input;
      requestInit = init;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      );
    };

    const result = await requestPlaygroundQuery(
      INPUT,
      controller.signal,
      fetcher,
    );

    expect(requestInput).toBe("/api/query");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.signal).toBe(controller.signal);
    expect(requestInit?.body).toBe(JSON.stringify(INPUT));
    expect(result).toEqual({
      body,
      kind: "query",
    });
  });

  it("preserves structured validation and throttling errors", async () => {
    const body: PlaygroundProxyErrorResponse = {
      error: {
        code: "RATE_LIMITED",
        message: "Too many playground queries. Wait before trying again.",
      },
    };

    const result = await requestPlaygroundQuery(
      INPUT,
      new AbortController().signal,
      () =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            headers: { "Content-Type": "application/json" },
            status: 429,
          }),
        ),
    );

    expect(result).toEqual({
      body,
      kind: "proxy-error",
    });
  });

  it("rejects JSON bodies that do not match the response contracts", async () => {
    for (const [status, body] of [
      [200, { ok: true, game: "rust" }],
      [200, { error: { code: "TIMEOUT" } }],
      [200, []],
      [
        200,
        {
          cache: { ageMs: 0, status: "miss", ttlMs: 5000 },
          durationMs: 12,
          error: { code: "TIMEOUT", message: "Timed out", source: {} },
          game: "rust",
          ok: false,
          sources: [],
          warnings: [],
        },
      ],
      [429, { message: "Too many requests" }],
    ] as const) {
      await expect(
        requestPlaygroundQuery(INPUT, new AbortController().signal, () =>
          Promise.resolve(new Response(JSON.stringify(body), { status })),
        ),
      ).rejects.toThrow(
        "The QueryHost web service returned an unexpected response.",
      );
    }
  });

  it("propagates cancellation to the active fetch", async () => {
    const controller = new AbortController();
    const fetcher: PlaygroundFetcher = (_input, init) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener(
          "abort",
          () => {
            reject(new DOMException("Cancelled", "AbortError"));
          },
          { once: true },
        );
      });

    const pending = requestPlaygroundQuery(INPUT, controller.signal, fetcher);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("rejects detections whose game or query the page cannot render", async () => {
    const query = {
      durationMs: 12,
      error: { code: "TIMEOUT", message: "Timed out" },
      game: "rust",
      ok: false,
      sources: [],
      warnings: [],
    };
    for (const body of [
      { ok: true, game: "rust", probes: [], result: query, evidence: "port" },
      { ok: true, game: "not-a-game", probes: [], result: query },
      { ok: true, game: "valheim", probes: [], result: query },
      { ok: true, game: "rust", probes: [], result: { ok: true } },
      { ok: false, error: { code: "NOT_DETECTED" }, probes: [] },
    ]) {
      const request = requestPlaygroundDetect(
        { host: "play.example.com" },
        PLAYGROUND_GAMES,
        new AbortController().signal,
        () => Promise.resolve(new Response(JSON.stringify(body))),
      );
      if (body.game === "rust" && body.result === query) {
        await expect(request).resolves.toMatchObject({
          body: { cache: { status: "miss" }, game: "rust" },
          kind: "detected",
        });
      } else {
        await expect(request).rejects.toThrow("unexpected response");
      }
    }
  });
});
