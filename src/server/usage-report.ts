import { createHash, timingSafeEqual } from "node:crypto";

import type {
  JsonValue,
  PlaygroundProxyErrorResponse,
} from "../lib/playground-contracts.js";
import { readBoundedText } from "./bounded-text.js";
import type { PublicQueryDependencies } from "./public-query.js";
import type {
  GamesUsage,
  GamesUsageSnapshot,
  SurfaceUsageSnapshot,
} from "./usage-stats.js";

const ORIGIN_TOKEN_HEADER = "x-queryhost-origin-token";
const UPSTREAM_STATS_TIMEOUT_MS = 3_000;
const UPSTREAM_STATS_MAX_BYTES = 65_536;

export interface UsageReportDependencies {
  /** Bearer token for the report, or `undefined` when the report is disabled. */
  readonly token: string | undefined;
  readonly startedAt: number;
  readonly playground: PublicQueryDependencies;
  readonly publicApi: PublicQueryDependencies;
  readonly games: GamesUsage;
}

export interface UsageReport {
  readonly startedAt: string;
  /** Same-origin playground and MCP tool queries, which share one gate. */
  readonly playground: SurfaceUsageSnapshot;
  readonly publicApi: SurfaceUsageSnapshot;
  readonly games: GamesUsageSnapshot;
  /** The private API's own counters, or `null` when they could not be read. */
  readonly api: JsonValue;
}

/** Reads the optional report token; unset keeps the endpoint disabled. */
export function loadUsageReportToken(
  environment: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const token = environment["QUERYHOST_WEB_STATS_TOKEN"];
  if (token === undefined) {
    return undefined;
  }
  if (token.length < 32 || token.length > 256) {
    throw new Error(
      "QUERYHOST_WEB_STATS_TOKEN must contain 32 through 256 characters.",
    );
  }
  return token;
}

function errorResponse(
  status: number,
  body: PlaygroundProxyErrorResponse,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
    status,
  });
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

function isAuthorized(request: Request, token: string): boolean {
  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  // Comparing fixed-length digests keeps the check constant-time.
  return timingSafeEqual(digest(presented), digest(token));
}

async function upstreamStats(
  dependencies: PublicQueryDependencies,
): Promise<JsonValue> {
  const target = dependencies.config.target;
  if (target.kind !== "hosted") {
    return null;
  }
  try {
    const signal = AbortSignal.timeout(UPSTREAM_STATS_TIMEOUT_MS);
    const response = await dependencies.fetcher(`${target.apiBaseUrl}/stats`, {
      headers: { [ORIGIN_TOKEN_HEADER]: target.apiOriginToken },
      method: "GET",
      redirect: "error",
      signal,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (
      response.status !== 200 ||
      !contentType.startsWith("application/json")
    ) {
      await response.body?.cancel();
      return null;
    }
    const text = await readBoundedText(
      response.body,
      UPSTREAM_STATS_MAX_BYTES,
      signal,
    );
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

/**
 * Serves aggregate, host-free usage counters for the operator. The route is
 * disabled (404) unless `QUERYHOST_WEB_STATS_TOKEN` is set, and then requires
 * that token as a bearer credential.
 */
export async function handleUsageReport(
  request: Request,
  dependencies: UsageReportDependencies,
): Promise<Response> {
  const token = dependencies.token;
  if (token === undefined) {
    return errorResponse(404, {
      error: { code: "NOT_FOUND", message: "Unknown API route." },
    });
  }
  if (request.method !== "GET") {
    return errorResponse(
      405,
      {
        error: {
          code: "METHOD_NOT_ALLOWED",
          message: "This route allows GET.",
        },
      },
      { Allow: "GET" },
    );
  }
  if (!isAuthorized(request, token)) {
    return errorResponse(
      401,
      {
        error: {
          code: "UNAUTHORIZED",
          message: "A valid bearer token is required.",
        },
      },
      { "WWW-Authenticate": "Bearer" },
    );
  }

  const report: UsageReport = {
    startedAt: new Date(dependencies.startedAt).toISOString(),
    playground: dependencies.playground.usage.snapshot(),
    publicApi: dependencies.publicApi.usage.snapshot(),
    games: dependencies.games.snapshot(),
    api: await upstreamStats(dependencies.playground),
  };
  return new Response(JSON.stringify(report), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: 200,
  });
}
