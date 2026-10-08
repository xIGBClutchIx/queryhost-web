import { createHash } from "node:crypto";

import type { GameDefinition } from "queryhost/registry";

import type { PlaygroundProxyErrorResponse } from "../lib/playground-contracts.js";
import { GAMES } from "../lib/queryhost.js";
import { PUBLIC_API_GAMES_CACHE_CONTROL } from "../lib/site.js";
import {
  handlePublicQuery,
  type PublicQueryDependencies,
} from "./public-query.js";
import { GamesUsage } from "./usage-stats.js";

/** Version segment of every public API route. */
export const PUBLIC_API_VERSION = "v1";

export interface PublicApiGamesResponse {
  readonly games: readonly GameDefinition[];
}

// The public API is credential-free, so any origin may read it. Never add
// Access-Control-Allow-Credentials here: callers are identified only by IP.
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Age, ETag, Retry-After, x-queryhost-cache",
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  });
}

function preflight(allow: string, allowHeaders = "Content-Type"): Response {
  return withCors(
    new Response(null, {
      headers: {
        "Access-Control-Allow-Headers": allowHeaders,
        "Access-Control-Allow-Methods": allow,
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
      },
      status: 204,
    }),
  );
}

function methodNotAllowed(allow: string): Response {
  const body: PlaygroundProxyErrorResponse = {
    error: {
      code: "METHOD_NOT_ALLOWED",
      message: `This route allows ${allow}.`,
    },
  };
  return withCors(
    new Response(JSON.stringify(body), {
      headers: {
        Allow: allow,
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
      status: 405,
    }),
  );
}

/**
 * Answers unknown `/api/v1/*` paths with a JSON 404 that browsers can read.
 * Preflights succeed so cross-origin callers can see that 404.
 */
export function handlePublicApiNotFound(request: Request): Response {
  if (request.method === "OPTIONS") {
    return preflight("GET, HEAD, POST, OPTIONS");
  }
  const body: PlaygroundProxyErrorResponse = {
    error: { code: "NOT_FOUND", message: "Unknown API route." },
  };
  return withCors(
    new Response(JSON.stringify(body), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
      status: 404,
    }),
  );
}

/** Handles `/api/v1/query` with its own caller budget and open CORS. */
export async function handlePublicApiQuery(
  request: Request,
  dependencies: PublicQueryDependencies,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return preflight("POST, OPTIONS");
  }
  if (request.method !== "POST") {
    return methodNotAllowed("POST, OPTIONS");
  }
  return withCors(await handlePublicQuery(request, dependencies));
}

const GAMES_BODY = JSON.stringify({
  games: GAMES,
} satisfies PublicApiGamesResponse);
// Weak because response compression changes the bytes but not the content.
const GAMES_ETAG = `W/"${createHash("sha256").update(GAMES_BODY).digest("base64url").slice(0, 27)}"`;

/** Process-wide counters for full and `304` games responses. */
export const publicApiGamesUsage: GamesUsage = new GamesUsage();

function matchesGamesEtag(header: string | null): boolean {
  if (header === null) {
    return false;
  }
  // If-None-Match uses weak comparison, so `W/` prefixes are ignored.
  const opaque = GAMES_ETAG.slice(2);
  return header
    .split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag.replace(/^W\//u, "") === opaque);
}

/** Handles `/api/v1/games` from the packaged registry with ETag revalidation. */
export function handlePublicApiGames(
  request: Request,
  usage: GamesUsage = publicApiGamesUsage,
): Response {
  if (request.method === "OPTIONS") {
    return preflight("GET, HEAD, OPTIONS", "Content-Type, If-None-Match");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed("GET, HEAD, OPTIONS");
  }
  const headers = {
    "Cache-Control": PUBLIC_API_GAMES_CACHE_CONTROL,
    ETag: GAMES_ETAG,
  };
  const notModified = matchesGamesEtag(request.headers.get("if-none-match"));
  usage.record(notModified);
  if (notModified) {
    return withCors(new Response(null, { headers, status: 304 }));
  }
  return withCors(
    new Response(request.method === "HEAD" ? null : GAMES_BODY, {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      },
      status: 200,
    }),
  );
}
