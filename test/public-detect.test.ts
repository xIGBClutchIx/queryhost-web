import type { DetectResult } from "queryhost";
import { describe, expect, it } from "vitest";

import type { PlaygroundDetectInput } from "../src/lib/playground-contracts.js";
import { ProxyGate, type ProxyGatePolicy } from "../src/server/proxy-gate.js";
import {
  DETECT_COST,
  handlePublicDetect,
  type LocalDetectInput,
  type LocalDetectRunner,
  type PublicDetectDependencies,
} from "../src/server/public-detect.js";
import type {
  LocalQueryRunner,
  ProxyFetcher,
  PublicQueryTarget,
} from "../src/server/public-query.js";
import { SurfaceUsage } from "../src/server/usage-stats.js";

const TOKEN = "a".repeat(32);
const POLICY: ProxyGatePolicy = {
  maxActive: 2,
  maxStartsPerCaller: DETECT_COST + 1,
  maxStartsPerWindow: 20,
  maxTrackedCallers: 4,
  windowMs: 60_000,
};
const HOSTED: PublicQueryTarget = {
  apiBaseUrl: "http://api.railway.internal:3000",
  apiOriginToken: TOKEN,
  kind: "hosted",
};
const NOT_DETECTED: DetectResult = {
  durationMs: 40,
  error: { code: "NOT_DETECTED", message: "No supported game answered." },
  ok: false,
  probes: [
    {
      error: "TIMEOUT",
      port: 25_565,
      protocol: "minecraft-java",
      status: "failed",
    },
  ],
};

const unusedQueryRunner: LocalQueryRunner = () =>
  Promise.reject(new Error("The local query runner should not be called."));
const unusedDetectRunner: LocalDetectRunner = () =>
  Promise.reject(new Error("The local detect runner should not be called."));
const unusedFetcher: ProxyFetcher = () =>
  Promise.reject(new Error("The hosted API should not be called."));

function dependencies(
  overrides: Partial<PublicDetectDependencies> = {},
  target: PublicQueryTarget = HOSTED,
): PublicDetectDependencies {
  return {
    config: { maxBodyBytes: 2_048, target, upstreamTimeoutMs: 7_000 },
    detectRunner: unusedDetectRunner,
    fetcher: unusedFetcher,
    gate: new ProxyGate(POLICY),
    queryRunner: unusedQueryRunner,
    usage: new SurfaceUsage(),
    ...overrides,
  };
}

function detectRequest(body: string): Request {
  return new Request("https://query.host/api/detect", {
    body,
    headers: {
      "Content-Type": "application/json",
      "x-real-ip": "203.0.113.10",
    },
    method: "POST",
  });
}

describe("public detect proxy", () => {
  it("forwards validated detections to the API with the origin token", async () => {
    const calls: { input: string | URL; init: RequestInit }[] = [];
    const fetcher: ProxyFetcher = (input, init) => {
      calls.push({ input, init });
      return Promise.resolve(
        new Response(JSON.stringify(NOT_DETECTED), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    const deps = dependencies({ fetcher });

    const response = await handlePublicDetect(
      detectRequest(
        '{"host":" PLAY.EXAMPLE.COM. ","port":25565,"mode":"full"}',
      ),
      deps,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const text = await response.text();
    expect(JSON.parse(text)).toEqual(NOT_DETECTED);
    expect(text).not.toContain(TOKEN);
    expect(String(calls[0]?.input)).toBe(
      "http://api.railway.internal:3000/detect",
    );
    expect(
      new Headers(calls[0]?.init.headers).get("x-queryhost-origin-token"),
    ).toBe(TOKEN);
    const body = calls[0]?.init.body;
    expect(
      typeof body === "string"
        ? (JSON.parse(body) as PlaygroundDetectInput)
        : body,
    ).toEqual({
      host: "play.example.com",
      mode: "full",
      port: 25_565,
    });
    expect(deps.gate.active).toBe(0);
  });

  it("charges each detection several starts before any probe", async () => {
    let calls = 0;
    const fetcher: ProxyFetcher = () => {
      calls += 1;
      return Promise.resolve(
        new Response(JSON.stringify(NOT_DETECTED), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    };
    const deps = dependencies({ fetcher });

    expect(
      (
        await handlePublicDetect(
          detectRequest('{"host":"play.example.com"}'),
          deps,
        )
      ).status,
    ).toBe(200);
    const limited = await handlePublicDetect(
      detectRequest('{"host":"play.example.com"}'),
      deps,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("60");
    expect(calls).toBe(1);
    expect(deps.usage.snapshot().rateLimited.caller).toBe(1);
  });

  it("rejects game choices and unknown fields before admission", async () => {
    const deps = dependencies();
    for (const body of [
      '{"host":"play.example.com","game":"rust"}',
      '{"host":"play.example.com","queryPort":27015}',
      '{"host":"play.example.com","timeoutMs":9000}',
      '{"host":"https://play.example.com"}',
    ]) {
      expect((await handlePublicDetect(detectRequest(body), deps)).status).toBe(
        400,
      );
    }
    const wrongMethod = await handlePublicDetect(
      new Request("https://query.host/api/detect"),
      deps,
    );
    expect(wrongMethod.status).toBe(405);
    expect(deps.usage.snapshot().requests).toMatchObject({
      invalid: 5,
      forwarded: 0,
    });
  });

  it("detects locally without the hosted API", async () => {
    const inputs: LocalDetectInput[] = [];
    const deps = dependencies(
      {
        detectRunner: (input) => {
          inputs.push(input);
          return Promise.resolve(NOT_DETECTED);
        },
      },
      { kind: "local" },
    );

    const response = await handlePublicDetect(
      detectRequest('{"host":"play.example.com","timeoutMs":3000}'),
      deps,
    );

    expect(response.status).toBe(200);
    expect(JSON.parse(await response.text())).toEqual(NOT_DETECTED);
    expect(inputs[0]).toMatchObject({
      host: "play.example.com",
      timeoutMs: 3_000,
    });
    expect(inputs[0]?.signal).toBeInstanceOf(AbortSignal);
  });
});
