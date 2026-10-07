import type { GameDefinition } from "queryhost/registry";

import type { PlaygroundProxyErrorResponse } from "../lib/playground-contracts.js";
import { GAMES } from "../lib/queryhost.js";
import {
  handlePublicQuery,
  type PublicQueryDependencies,
} from "./public-query.js";

/** Version segment of every public API route. */
export const PUBLIC_API_VERSION = "v1";

export interface PublicApiGamesResponse {
  readonly games: readonly GameDefinition[];
}

// The public API is credential-free, so any origin may read it. Never add
// Access-Control-Allow-Credentials here: callers are identified only by IP.
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers": "Age, Retry-After, x-queryhost-cache",
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

function preflight(allow: string): Response {
  return withCors(
    new Response(null, {
      headers: {
        "Access-Control-Allow-Headers": "Content-Type",
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

/** Handles `/api/v1/games` from the packaged registry. */
export function handlePublicApiGames(request: Request): Response {
  if (request.method === "OPTIONS") {
    return preflight("GET, HEAD, OPTIONS");
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return methodNotAllowed("GET, HEAD, OPTIONS");
  }
  const body: PublicApiGamesResponse = { games: GAMES };
  return withCors(
    new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
      },
      status: 200,
    }),
  );
}
