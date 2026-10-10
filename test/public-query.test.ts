import { describe, expect, it } from "vitest";

import type {
  JsonValue,
  PlaygroundQueryInput,
} from "../src/lib/playground-contracts.js";
import { ProxyGate, type ProxyGatePolicy } from "../src/server/proxy-gate.js";
import {
  acceptsQueryStream,
  handlePublicQuery,
  loadProxyGatePolicy,
  loadPublicQueryConfig,
  type LocalQueryRunner,
  type ProxyFetcher,
  type PublicQueryDependencies,
} from "../src/server/public-query.js";
import { SurfaceUsage } from "../src/server/usage-stats.js";

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
    usage: new SurfaceUsage(),
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
  it("bounds upstream response bytes before returning data and releases admission", async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2_097_153));
      },
      cancel() {
        cancelled = true;
      },
    });
    const deps = dependencies(() =>
      Promise.resolve(
        new Response(stream, {
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const response = await handlePublicQuery(
      queryRequest(
        JSON.stringify({ game: "minecraft-java", host: "example.com" }),
      ),
      deps,
    );
    expect(response.status).toBe(502);
    expect(cancelled).toBe(true);
    expect(deps.gate.active).toBe(0);
  });
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

    const missingA2sPort = await handlePublicQuery(
      queryRequest(JSON.stringify({ game: "a2s", host: "play.example.com" })),
      shared,
    );
    expect(missingA2sPort.status).toBe(400);
    expect(calls).toBe(0);

    const duplicateA2sPort = await handlePublicQuery(
      queryRequest(
        JSON.stringify({
          game: "a2s",
          host: "play.example.com",
          port: 27_015,
          queryPort: 27_016,
        }),
      ),
      shared,
    );
    expect(duplicateA2sPort.status).toBe(400);
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

  it("stops reading streamed bodies when the byte limit is exceeded", async () => {
    let cancelled = false;
    let calls = 0;
    let chunks = 0;
    const stream = new ReadableStream<Uint8Array>({
      cancel(): void {
        cancelled = true;
      },
      pull(controller): void {
        chunks += 1;
        controller.enqueue(new Uint8Array(1_025));
        if (chunks === 3) {
          controller.close();
        }
      },
    });
    const requestInit: RequestInit & { readonly duplex: "half" } = {
      body: stream,
      duplex: "half",
      headers: { "Content-Type": "application/json" },
      method: "POST",
    };
    const request = new Request("https://query.host/api/query", requestInit);
    const response = await handlePublicQuery(
      request,
      dependencies(() => {
        calls += 1;
        return Promise.resolve(
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(calls).toBe(0);
  });

  it("rejects invalid Content-Length before reading the body", async () => {
    let calls = 0;
    const request = queryRequest(
      JSON.stringify({ game: "rust", host: "play.example.com" }),
    );
    request.headers.set("Content-Length", "invalid");
    const response = await handlePublicQuery(
      request,
      dependencies(() => {
        calls += 1;
        return Promise.resolve(
          new Response("{}", {
            headers: { "Content-Type": "application/json" },
          }),
        );
      }),
    );

    expect(response.status).toBe(400);
    expect(calls).toBe(0);
  });

  it("accepts a valid JSON body at the exact byte limit", async () => {
    let calls = 0;
    const body = JSON.stringify({ game: "rust", host: "play.example.com" });
    const shared = dependencies(() => {
      calls += 1;
      return Promise.resolve(
        new Response("{}", {
          headers: { "Content-Type": "application/json" },
        }),
      );
    });
    const exactLimit: PublicQueryDependencies = {
      ...shared,
      config: {
        ...shared.config,
        maxBodyBytes: new TextEncoder().encode(body).byteLength,
      },
    };

    expect(
      (await handlePublicQuery(queryRequest(body), exactLimit)).status,
    ).toBe(200);
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
        game: "minecraft-java",
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
      usage: new SurfaceUsage(),
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

  it("counts outcomes by fixed category without recording callers or targets", async () => {
    const deps = dependencies(
      () =>
        Promise.resolve(
          new Response('{"ok":true}', {
            headers: {
              "Content-Type": "application/json",
              "x-queryhost-cache": "hit",
            },
          }),
        ),
      { ...POLICY, maxStartsPerCaller: 1 },
    );
    const body = JSON.stringify({ game: "rust", host: "secret.example.com" });

    await handlePublicQuery(queryRequest(body), deps);
    await handlePublicQuery(queryRequest(body), deps);
    await handlePublicQuery(queryRequest("{}"), deps);

    const snapshot = deps.usage.snapshot();
    expect(snapshot).toEqual({
      requests: { invalid: 1, rateLimited: 1, forwarded: 1, unavailable: 0 },
      rateLimited: { active: 0, window: 0, caller: 1, callers: 0 },
      upstreamStatus: { "200": 1 },
      cache: { hit: 1, miss: 0, coalesced: 0 },
    });
    expect(JSON.stringify(snapshot)).not.toContain("secret");
  });

  describe("streamed queries", () => {
    const RESULT = {
      cache: { ageMs: 0, status: "miss", ttlMs: 10_000 },
      data: {},
      durationMs: 31,
      game: "rust",
      ok: true,
      partial: false,
      server: { name: "Test server" },
      sources: [{ rttMs: 31, source: "a2s-info", status: "ok" }],
      warnings: [],
    };
    const LINES = [
      '{"type":"started","source":"a2s-info"}',
      '{"type":"completed","report":{"source":"a2s-info","status":"ok","rttMs":31}}',
      JSON.stringify({ result: RESULT, type: "result" }),
    ];

    function streamRequest(address = "203.0.113.10"): Request {
      return new Request("https://query.host/api/query", {
        body: JSON.stringify({ game: "rust", host: "play.example.com" }),
        headers: {
          Accept: "application/x-ndjson, application/json",
          "Content-Type": "application/json",
          "x-real-ip": address,
        },
        method: "POST",
      });
    }

    /** An upstream NDJSON body whose chunks the test releases one at a time. */
    function controlledUpstream(): {
      readonly response: Response;
      readonly push: (text: string) => void;
      readonly close: () => void;
    } {
      let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          controller = streamController;
        },
      });
      return {
        close: () => controller?.close(),
        push: (text) => controller?.enqueue(new TextEncoder().encode(text)),
        response: new Response(body, {
          headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
        }),
      };
    }

    it("asks for NDJSON upstream and relays validated lines while holding admission", async () => {
      const requests: RecordedRequest[] = [];
      const upstream = controlledUpstream();
      const deps = dependencies(
        (input, init) => {
          requests.push({ input, init });
          return Promise.resolve(upstream.response);
        },
        { ...POLICY, maxActive: 1 },
      );

      const response = await handlePublicQuery(streamRequest(), deps);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(
        "application/x-ndjson; charset=utf-8",
      );
      expect(new Headers(requests[0]?.init.headers).get("accept")).toBe(
        "application/x-ndjson, application/json",
      );
      expect(deps.gate.active).toBe(1);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      // A line split across chunks is relayed once it is complete.
      upstream.push(`${LINES[0] ?? ""}\n${(LINES[1] ?? "").slice(0, 20)}`);
      const first = await reader?.read();
      expect(decoder.decode(first?.value)).toBe(`${LINES[0] ?? ""}\n`);

      upstream.push(`${(LINES[1] ?? "").slice(20)}\n${LINES[2] ?? ""}\n`);
      upstream.close();
      let rest = "";
      for (
        let chunk = await reader?.read();
        chunk?.done === false;
        chunk = await reader?.read()
      ) {
        rest += decoder.decode(chunk.value);
      }
      expect(rest.trimEnd().split("\n")).toEqual([LINES[1], LINES[2]]);
      expect(deps.gate.active).toBe(0);
      expect(deps.usage.snapshot()).toMatchObject({
        cache: { miss: 1 },
        requests: { forwarded: 1, unavailable: 0 },
      });
    });

    it("fails the stream on an invalid line or a missing result", async () => {
      for (const body of [
        '{"type":"started","source":"a2s-info"}\n{"type":"surprise"}\n',
        '{"type":"started","source":"a2s-info"}\n',
      ]) {
        const deps = dependencies(() =>
          Promise.resolve(
            new Response(body, {
              headers: { "Content-Type": "application/x-ndjson" },
            }),
          ),
        );
        const response = await handlePublicQuery(streamRequest(), deps);
        await expect(response.text()).rejects.toThrow();
        expect(deps.gate.active).toBe(0);
        expect(deps.usage.snapshot().requests.unavailable).toBe(1);
      }
    });

    it("releases admission when the caller cancels the stream", async () => {
      const upstream = controlledUpstream();
      const deps = dependencies(() => Promise.resolve(upstream.response));
      const response = await handlePublicQuery(streamRequest(), deps);
      expect(deps.gate.active).toBe(1);
      await response.body?.cancel();
      expect(deps.gate.active).toBe(0);
    });

    it("keeps JSON refusals from the query service as JSON", async () => {
      const deps = dependencies(() =>
        Promise.resolve(
          new Response(
            '{"error":{"code":"OVERLOADED","message":"At capacity."}}',
            {
              headers: {
                "Content-Type": "application/json",
                "Retry-After": "1",
              },
              status: 429,
            },
          ),
        ),
      );
      const response = await handlePublicQuery(streamRequest(), deps);
      expect(response.status).toBe(429);
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(response.headers.get("retry-after")).toBe("1");
      expect(deps.gate.active).toBe(0);
    });

    it("streams local queries with the library's progress callback", async () => {
      const queryRunner: LocalQueryRunner = (input) => {
        input.onSource?.({ source: "a2s-info", type: "started" });
        input.onSource?.({
          report: { rttMs: 31, source: "a2s-info", status: "ok" },
          type: "completed",
        });
        return Promise.resolve({
          data: { players: [] },
          durationMs: 31,
          game: "rust",
          ok: true,
          partial: false,
          server: { name: "Test server" },
          sources: [{ rttMs: 31, source: "a2s-info", status: "ok" }],
          warnings: [],
        });
      };
      const gate = new ProxyGate(POLICY);
      const response = await handlePublicQuery(streamRequest(), {
        config: {
          maxBodyBytes: 2_048,
          target: { kind: "local" },
          upstreamTimeoutMs: 7_000,
        },
        fetcher: () =>
          Promise.reject(new Error("The hosted API should not be called.")),
        gate,
        queryRunner,
        usage: new SurfaceUsage(),
      });

      const lines = (await response.text()).trimEnd().split("\n");
      const parse = (line: string): JsonValue => JSON.parse(line) as JsonValue;
      expect(lines.slice(0, 2).map(parse)).toEqual(
        LINES.slice(0, 2).map(parse),
      );
      expect(JSON.parse(lines[2] ?? "")).toMatchObject({
        result: { cache: { status: "miss", ttlMs: 0 }, ok: true },
        type: "result",
      });
      expect(gate.active).toBe(0);
    });

    it("aborts a local query and releases admission when the caller cancels", async () => {
      let querySignal: AbortSignal | undefined;
      const gate = new ProxyGate(POLICY);
      const response = await handlePublicQuery(streamRequest(), {
        config: {
          maxBodyBytes: 2_048,
          target: { kind: "local" },
          upstreamTimeoutMs: 7_000,
        },
        fetcher: () =>
          Promise.reject(new Error("The hosted API should not be called.")),
        gate,
        queryRunner: (input) => {
          querySignal = input.signal;
          return new Promise(() => undefined);
        },
        usage: new SurfaceUsage(),
      });
      expect(gate.active).toBe(1);

      await response.body?.cancel();
      expect(querySignal?.aborted).toBe(true);
      expect(gate.active).toBe(0);
    });

    it("answers JSON when NDJSON is refused", () => {
      expect(
        acceptsQueryStream(new Headers({ Accept: "application/x-ndjson;q=0" })),
      ).toBe(false);
      expect(acceptsQueryStream(new Headers({ Accept: "*/*" }))).toBe(false);
      expect(
        acceptsQueryStream(
          new Headers({ Accept: "application/json, Application/X-NDJSON" }),
        ),
      ).toBe(true);
    });
  });
});
