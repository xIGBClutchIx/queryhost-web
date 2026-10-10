import type { QuerySourceEvent } from "queryhost";
import { describe, expect, it } from "vitest";

import type {
  PlaygroundProxyErrorResponse,
  PlaygroundQueryResponse,
} from "../src/lib/playground-contracts.js";
import {
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

  describe("streamed queries", () => {
    const RESULT: PlaygroundQueryResponse = {
      cache: { ageMs: 0, status: "miss", ttlMs: 10_000 },
      data: {},
      durationMs: 42,
      game: "minecraft-java",
      ok: true,
      partial: false,
      server: { name: "Example" },
      sources: [{ rttMs: 40, source: "minecraft-slp", status: "ok" }],
      warnings: [],
    };

    function ndjson(chunks: readonly string[]): Response {
      const encoder = new TextEncoder();
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of chunks)
              controller.enqueue(encoder.encode(chunk));
            controller.close();
          },
        }),
        { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } },
      );
    }

    it("asks for NDJSON and reports progress before the result", async () => {
      let requestInit: RequestInit | undefined;
      const result = JSON.stringify({ result: RESULT, type: "result" });
      const events: QuerySourceEvent[] = [];
      const response = await requestPlaygroundQuery(
        INPUT,
        new AbortController().signal,
        (_input, init) => {
          requestInit = init;
          return Promise.resolve(
            ndjson([
              '{"type":"started","source":"minecraft-slp"}\n{"type":"comp',
              'leted","report":{"source":"minecraft-slp","status":"ok","rttMs":40}}\n',
              result,
            ]),
          );
        },
        (event) => {
          events.push(event);
        },
      );

      expect(new Headers(requestInit?.headers).get("accept")).toBe(
        "application/x-ndjson, application/json",
      );
      expect(events).toEqual([
        { source: "minecraft-slp", type: "started" },
        {
          report: { rttMs: 40, source: "minecraft-slp", status: "ok" },
          type: "completed",
        },
      ]);
      expect(response).toEqual({ body: RESULT, kind: "query" });
    });

    it("treats a stream without exactly one valid result as unexpected", async () => {
      const result = JSON.stringify({ result: RESULT, type: "result" });
      for (const chunks of [
        ['{"type":"started","source":"minecraft-slp"}\n'],
        [`${result}\n${result}\n`],
        ['{"type":"result","result":{"ok":true}}\n'],
        ["not json\n"],
      ]) {
        await expect(
          requestPlaygroundQuery(
            INPUT,
            new AbortController().signal,
            () => Promise.resolve(ndjson(chunks)),
            () => undefined,
          ),
        ).rejects.toThrow(
          "The QueryHost web service returned an unexpected response.",
        );
      }
    });

    it("still reads JSON answers such as rate limits", async () => {
      const body: PlaygroundProxyErrorResponse = {
        error: { code: "RATE_LIMITED", message: "Slow down." },
      };
      await expect(
        requestPlaygroundQuery(
          INPUT,
          new AbortController().signal,
          () =>
            Promise.resolve(
              new Response(JSON.stringify(body), {
                headers: { "Content-Type": "application/json" },
                status: 429,
              }),
            ),
          () => undefined,
        ),
      ).resolves.toEqual({ body, kind: "proxy-error" });
    });
  });
});
