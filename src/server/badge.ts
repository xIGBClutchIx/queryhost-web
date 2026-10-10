import { GAMES } from "../lib/queryhost.js";
import { splitTarget } from "../lib/result-url.js";
import type {
  JsonObject,
  JsonValue,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
} from "../lib/playground-contracts.js";
import { renderBadgeSvg, type BadgeState } from "./badge-svg.js";
import { ProxyGate, type ProxyGatePolicy } from "./proxy-gate.js";
import {
  forwardQuery,
  integerEnvironment,
  parseQueryFields,
  PublicQueryInputError,
  type QueryTargetDependencies,
} from "./public-query.js";

/** How long badge results are reused, and how many are kept. */
export interface BadgeCachePolicy {
  readonly maxEntries: number;
  /** Longest age at which a result is still served when a fresh one cannot be fetched. */
  readonly maxStaleMs: number;
  readonly offlineTtlMs: number;
  readonly onlineTtlMs: number;
}

export interface BadgeDependencies {
  readonly cache: BadgeCachePolicy;
  readonly gate: ProxyGate;
  readonly now: () => number;
  readonly query: QueryTargetDependencies;
}

interface CacheEntry {
  readonly state: BadgeState;
  readonly expiresAt: number;
  readonly storedAt: number;
}

interface BadgeResolution {
  readonly state: BadgeState;
  /** Seconds a viewer may reuse this badge; 0 means do not store it. */
  readonly maxAgeSeconds: number;
}

// Every badge miss shares one global budget. Badge images are fetched by
// image proxies (GitHub's camo, Discord, forums) that funnel many viewers
// through a few addresses, so a per-caller limit would block real viewers.
const BADGE_CALLER = "badge";
const UNAVAILABLE_MAX_AGE_SECONDS = 10;
const BADGE_ROUTE_ALLOW = "GET, HEAD, OPTIONS";
const PORT_PATTERN = /^\d{1,5}$/u;
const MAX_NAME_LENGTH = 256;

/** Reads the badge budget, which is global and separate from every other gate. */
export function loadBadgeGatePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): ProxyGatePolicy {
  const maxStartsPerWindow = integerEnvironment(
    environment,
    "QUERYHOST_WEB_BADGE_MAX_STARTS_PER_WINDOW",
    60,
    1,
    10_000,
  );
  return {
    maxActive: integerEnvironment(
      environment,
      "QUERYHOST_WEB_BADGE_MAX_ACTIVE",
      4,
      1,
      128,
    ),
    maxStartsPerCaller: maxStartsPerWindow,
    maxStartsPerWindow,
    maxTrackedCallers: 1,
    windowMs: 60_000,
  };
}

export const DEFAULT_BADGE_CACHE_POLICY: BadgeCachePolicy = {
  maxEntries: 2_048,
  maxStaleMs: 600_000,
  offlineTtlMs: 30_000,
  onlineTtlMs: 60_000,
};

function portValue(raw: string | null | undefined): JsonValue | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  // Non-numeric text is passed through so validation reports it.
  return PORT_PATTERN.test(raw) ? Number(raw) : raw;
}

/**
 * Turns `{game}/{target}{extension}?queryPort=` image paths into a summary
 * query input. Returns undefined when the file lacks the extension, and throws
 * {@link PublicQueryInputError} when it names an invalid server.
 */
export function parseImageRequest(
  game: string,
  file: string,
  extension: ".png" | ".svg",
  search: URLSearchParams,
): PlaygroundQueryInput | undefined {
  if (!file.endsWith(extension)) {
    return undefined;
  }
  const { host, port } = splitTarget(file.slice(0, -extension.length));
  const portField = portValue(port);
  const queryPortField = portValue(search.get("queryPort"));
  const fields: JsonObject = {
    game,
    host,
    mode: "summary",
    ...(portField === undefined ? {} : { port: portField }),
    ...(queryPortField === undefined ? {} : { queryPort: queryPortField }),
  };
  return parseQueryFields(fields);
}

/** Parses `/api/v1/badge/{game}/{target}.svg`; see {@link parseImageRequest}. */
export function parseBadgeRequest(
  game: string,
  file: string,
  search: URLSearchParams,
): PlaygroundQueryInput | undefined {
  return parseImageRequest(game, file, ".svg", search);
}

function jsonObjectField(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : undefined;
}

function countField(value: JsonValue | undefined): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** A server-reported name, bounded so cached entries stay small. */
function nameField(value: JsonValue | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const name = value.slice(0, MAX_NAME_LENGTH);
  return name.trim().length === 0 ? undefined : name;
}

/** Reads the badge-relevant fields of a hosted query response body. */
export function badgeStateFromResult(text: string): BadgeState | undefined {
  let parsed: JsonValue;
  try {
    parsed = JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
  const body = jsonObjectField(parsed);
  if (body === undefined) {
    return undefined;
  }
  if (body["ok"] === false) {
    return { kind: "offline" };
  }
  if (body["ok"] !== true) {
    return undefined;
  }
  const server = jsonObjectField(body["server"]);
  const players = jsonObjectField(server?.["players"]);
  const online = countField(players?.["online"]);
  const max = countField(players?.["max"]);
  const name = nameField(server?.["name"]);
  return {
    kind: "online",
    partial: body["partial"] === true,
    ...(online === undefined ? {} : { online }),
    ...(max === undefined ? {} : { max }),
    ...(name === undefined ? {} : { name }),
  };
}

function badgeKey(input: PlaygroundQueryInput): string {
  return [input.game, input.host, input.port ?? "", input.queryPort ?? ""].join(
    "|",
  );
}

/**
 * Resolves badges from a bounded, process-local cache. Concurrent requests for
 * one server share a single query, and only cache misses use the badge budget.
 */
export class BadgeService {
  readonly #dependencies: BadgeDependencies;
  readonly #entries = new Map<string, CacheEntry>();
  readonly #inflight = new Map<string, Promise<BadgeResolution>>();

  public constructor(dependencies: BadgeDependencies) {
    this.#dependencies = dependencies;
  }

  public get size(): number {
    return this.#entries.size;
  }

  public resolve(input: PlaygroundQueryInput): Promise<BadgeResolution> {
    const key = badgeKey(input);
    const now = this.#dependencies.now();
    const entry = this.#entries.get(key);
    if (entry !== undefined && now < entry.expiresAt) {
      return Promise.resolve(this.#fromEntry(entry, now));
    }
    const pending = this.#inflight.get(key);
    if (pending !== undefined) {
      return pending;
    }

    const admission = this.#dependencies.gate.admit(BADGE_CALLER, now);
    if (!admission.accepted) {
      return Promise.resolve(this.#fallback(key, now));
    }
    const run = this.#refresh(key, input)
      .catch(() => this.#fallback(key, this.#dependencies.now()))
      .finally(() => {
        admission.release();
        this.#inflight.delete(key);
      });
    this.#inflight.set(key, run);
    return run;
  }

  async #refresh(
    key: string,
    input: PlaygroundQueryInput,
  ): Promise<BadgeResolution> {
    // Viewers share this query, so one viewer leaving must not cancel it;
    // forwardQuery still bounds it with the upstream deadline.
    const response = await forwardQuery(
      input,
      this.#dependencies.query,
      new AbortController().signal,
    );
    const state =
      response.status === 200
        ? badgeStateFromResult(await response.text())
        : undefined;
    const now = this.#dependencies.now();
    if (state === undefined) {
      return this.#fallback(key, now);
    }
    const policy = this.#dependencies.cache;
    const ttlMs =
      state.kind === "online" ? policy.onlineTtlMs : policy.offlineTtlMs;
    const entry: CacheEntry = { expiresAt: now + ttlMs, state, storedAt: now };
    this.#store(key, entry);
    return this.#fromEntry(entry, now);
  }

  #fromEntry(entry: CacheEntry, now: number): BadgeResolution {
    return {
      maxAgeSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1_000)),
      state: entry.state,
    };
  }

  /** Serves a recent stale result when a fresh one is unavailable. */
  #fallback(key: string, now: number): BadgeResolution {
    const entry = this.#entries.get(key);
    if (
      entry !== undefined &&
      now - entry.storedAt <= this.#dependencies.cache.maxStaleMs
    ) {
      return { maxAgeSeconds: UNAVAILABLE_MAX_AGE_SECONDS, state: entry.state };
    }
    return { maxAgeSeconds: 0, state: { kind: "unavailable" } };
  }

  #store(key: string, entry: CacheEntry): void {
    // Map order doubles as recency: re-inserting moves the key to the end.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    while (this.#entries.size > this.#dependencies.cache.maxEntries) {
      const oldest = this.#entries.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.#entries.delete(oldest.value);
    }
  }
}

function gameLabel(game: string): string {
  return (
    GAMES.find((definition) => definition.id === game)?.name ?? "QueryHost"
  );
}

function badgeResponse(
  request: Request,
  label: string,
  state: BadgeState,
  status: number,
  maxAgeSeconds: number,
): Response {
  const svg = renderBadgeSvg(label, state);
  return new Response(request.method === "HEAD" ? null : svg, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":
        maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : "no-cache",
      // The SVG can be opened directly as a document; it needs nothing but its
      // own inline presentation attributes.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
    status,
  });
}

function badgeRouteError(
  status: 404 | 405,
  code: "METHOD_NOT_ALLOWED" | "NOT_FOUND",
  message: string,
): Response {
  const body: PlaygroundProxyErrorResponse = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      Allow: BADGE_ROUTE_ALLOW,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

/** Handles `/api/v1/badge/{game}/{host}[:{port}].svg`. */
export async function handleBadgeRequest(
  request: Request,
  params: { readonly game: string; readonly file: string },
  service: BadgeService,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Methods": BADGE_ROUTE_ALLOW,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Max-Age": "86400",
        "Cache-Control": "no-store",
      },
      status: 204,
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return badgeRouteError(
      405,
      "METHOD_NOT_ALLOWED",
      `This route allows ${BADGE_ROUTE_ALLOW}.`,
    );
  }

  let input: PlaygroundQueryInput | undefined;
  try {
    input = parseBadgeRequest(
      params.game,
      params.file,
      new URL(request.url).searchParams,
    );
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      return badgeResponse(request, "QueryHost", { kind: "invalid" }, 400, 0);
    }
    throw error;
  }
  if (input === undefined) {
    return badgeRouteError(
      404,
      "NOT_FOUND",
      "Badge paths end in .svg, as in /api/v1/badge/{game}/{host}.svg.",
    );
  }

  const { maxAgeSeconds, state } = await service.resolve(input);
  return badgeResponse(
    request,
    gameLabel(input.game),
    state,
    200,
    maxAgeSeconds,
  );
}
