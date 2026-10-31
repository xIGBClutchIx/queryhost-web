import { createHash } from "node:crypto";

import { parseBadgeOptions, type BadgeOptions } from "../lib/badge-url.js";
import { minecraftIcon } from "../lib/minecraft-presentation.js";
import { GAMES } from "../lib/queryhost.js";
import { splitTarget } from "../lib/result-url.js";
import type {
  JsonObject,
  JsonValue,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
} from "../lib/playground-contracts.js";
import {
  badgeMessage,
  badgePalette,
  renderBadgeSvg,
  statusToneKey,
  type BadgeState,
} from "./badge-svg.js";
import { callerAddress, rateLimitIdentity } from "./client-address.js";
import { matchesEtag } from "./http-shared.js";
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
  /** How long a failed query is remembered before another may start; 15 s when omitted. */
  readonly failureTtlMs?: number;
}

export interface BadgeDependencies {
  readonly cache: BadgeCachePolicy;
  readonly gate: ProxyGate;
  /**
   * Starts per window that servers without a recent result may use. The rest
   * of the window is kept for refreshing badges already in the cache.
   */
  readonly maxNewStartsPerWindow?: number;
  readonly now: () => number;
  readonly query: QueryTargetDependencies;
}

/** The badge gate plus how much of its window new servers may use. */
export interface BadgeGatePolicy extends ProxyGatePolicy {
  readonly maxNewStartsPerWindow: number;
}

interface CacheEntry {
  readonly state: BadgeState;
  readonly expiresAt: number;
  readonly storedAt: number;
}

export interface BadgeResolution {
  readonly state: BadgeState;
  /** Seconds a viewer may reuse this badge; always at least 1. */
  readonly maxAgeSeconds: number;
}

/** The caller for resolutions that name none, such as link previews. */
const SHARED_CALLER = "shared";
const DEFAULT_FAILURE_TTL_MS = 15_000;
/** The longest a viewer keeps a stale or `unavailable` badge. */
const UNAVAILABLE_MAX_AGE_SECONDS = 15;
const BADGE_ROUTE_ALLOW = "GET, HEAD, OPTIONS";
const PORT_PATTERN = /^\d{1,5}$/u;
const MAX_NAME_LENGTH = 256;
const MAX_MAP_LENGTH = 64;
/** Favicons are kept apart from results: at most 256 of 32 KiB each. */
const MAX_FAVICON_LENGTH = 32_768;
const MAX_FAVICONS = 256;
const MAX_TRACKED_CALLERS = 4_096;
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * Reads the badge budget, which is separate from every other gate. Each
 * caller address may start only part of it, and servers without a recent
 * result may start only part, so neither one address nor a flood of new
 * servers can starve badges that are already being viewed.
 */
export function loadBadgeGatePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): BadgeGatePolicy {
  const maxStartsPerWindow = integerEnvironment(
    environment,
    "QUERYHOST_WEB_BADGE_MAX_STARTS_PER_WINDOW",
    60,
    1,
    10_000,
  );
  const reserve = integerEnvironment(
    environment,
    "QUERYHOST_WEB_BADGE_REFRESH_RESERVE",
    Math.floor(maxStartsPerWindow / 3),
    0,
    maxStartsPerWindow - 1,
  );
  const maxActive = integerEnvironment(
    environment,
    "QUERYHOST_WEB_BADGE_MAX_ACTIVE",
    4,
    1,
    128,
  );
  return {
    maxActive,
    // One address waiting on unreachable servers must not hold every slot.
    maxActivePerCaller: integerEnvironment(
      environment,
      "QUERYHOST_WEB_BADGE_MAX_ACTIVE_PER_CALLER",
      Math.min(2, maxActive),
      1,
      maxActive,
    ),
    maxNewStartsPerWindow: maxStartsPerWindow - reserve,
    maxStartsPerCaller: integerEnvironment(
      environment,
      "QUERYHOST_WEB_BADGE_MAX_STARTS_PER_CALLER",
      Math.min(15, maxStartsPerWindow),
      1,
      maxStartsPerWindow,
    ),
    maxStartsPerWindow,
    maxTrackedCallers: MAX_TRACKED_CALLERS,
    windowMs: 60_000,
  };
}

export const DEFAULT_BADGE_CACHE_POLICY: BadgeCachePolicy = {
  failureTtlMs: DEFAULT_FAILURE_TTL_MS,
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
 * Turns `{game}/{target}{extension}?queryPort=` paths into a summary query
 * input. Returns undefined when the file lacks the extension, and throws
 * {@link PublicQueryInputError} when it names an invalid server.
 */
export function parseImageRequest(
  game: string,
  file: string,
  extension: ".json" | ".png" | ".svg" | "",
  search: URLSearchParams,
): PlaygroundQueryInput | undefined {
  if (!file.endsWith(extension)) {
    return undefined;
  }
  const { host, port } = splitTarget(
    file.slice(0, file.length - extension.length),
  );
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

/** Server-reported text, bounded so cached entries stay small. */
function textField(
  value: JsonValue | undefined,
  maximum: number,
): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const text = value.slice(0, maximum);
  return text.trim().length === 0 ? undefined : text;
}

/** A map name without control or bidirectional characters. */
function mapField(value: JsonValue | undefined): string | undefined {
  const map = textField(value, MAX_MAP_LENGTH)
    ?.replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim();
  return map === undefined || map.length === 0 ? undefined : map;
}

function faviconField(
  game: JsonValue | undefined,
  data: JsonObject | undefined,
): string | undefined {
  const favicon = data?.["favicon"];
  if (
    game !== "minecraft-java" ||
    typeof favicon !== "string" ||
    favicon.length > MAX_FAVICON_LENGTH
  ) {
    return undefined;
  }
  return minecraftIcon(favicon);
}

/** Error codes that mean the address can never be queried, not that it is down. */
const INVALID_TARGET_CODES = new Set(["INVALID_INPUT", "TARGET_BLOCKED"]);

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
    const code = jsonObjectField(body["error"])?.["code"];
    return typeof code === "string" && INVALID_TARGET_CODES.has(code)
      ? { kind: "invalid" }
      : { kind: "offline" };
  }
  if (body["ok"] !== true) {
    return undefined;
  }
  const server = jsonObjectField(body["server"]);
  const players = jsonObjectField(server?.["players"]);
  const online = countField(players?.["online"]);
  const max = countField(players?.["max"]);
  const name = textField(server?.["name"], MAX_NAME_LENGTH);
  const map = mapField(server?.["map"]);
  const favicon = faviconField(body["game"], jsonObjectField(body["data"]));
  return {
    kind: "online",
    partial: body["partial"] === true,
    ...(online === undefined ? {} : { online }),
    ...(max === undefined ? {} : { max }),
    ...(name === undefined ? {} : { name }),
    ...(map === undefined ? {} : { map }),
    ...(favicon === undefined ? {} : { favicon }),
  };
}

/**
 * The query a badge runs. Leaving out the default port asks for the same
 * server as naming it, so both share one cache entry, except where the game
 * discovers its port through DNS SRV only when none is given.
 */
export function badgeQuery(input: PlaygroundQueryInput): PlaygroundQueryInput {
  if (input.port !== undefined) {
    return input;
  }
  const game = GAMES.find((definition) => definition.id === input.game);
  if (
    game?.defaultPort === undefined ||
    game.capabilities.srv !== "unsupported"
  ) {
    return input;
  }
  return { ...input, port: game.defaultPort };
}

function badgeKey(input: PlaygroundQueryInput): string {
  return [input.game, input.host, input.port ?? "", input.queryPort ?? ""].join(
    "|",
  );
}

function trimToBound<V>(map: Map<string, V>, maximum: number): void {
  while (map.size > maximum) {
    const oldest = map.keys().next();
    if (oldest.done === true) {
      break;
    }
    map.delete(oldest.value);
  }
}

/**
 * Resolves badges from a bounded, process-local cache. Concurrent requests for
 * one server share a single query, only cache misses use the badge budget, and
 * a failed query is remembered briefly so overload is not retried per viewer.
 */
export class BadgeService {
  readonly #dependencies: BadgeDependencies;
  readonly #entries = new Map<string, CacheEntry>();
  /** When a server whose last query failed may be queried again. */
  readonly #failures = new Map<string, number>();
  /** Validated favicons of the most recently refreshed servers. */
  readonly #favicons = new Map<string, string>();
  readonly #inflight = new Map<string, Promise<BadgeResolution>>();

  public constructor(dependencies: BadgeDependencies) {
    this.#dependencies = dependencies;
  }

  public get size(): number {
    return this.#entries.size;
  }

  /**
   * Resolves one server's badge. `caller` is the rate-limit identity of the
   * viewer; resolutions without one share a single caller budget.
   */
  public resolve(
    input: PlaygroundQueryInput,
    caller: string = SHARED_CALLER,
  ): Promise<BadgeResolution> {
    const query = badgeQuery(input);
    const key = badgeKey(query);
    const now = this.#dependencies.now();
    const entry = this.#entries.get(key);
    if (entry !== undefined && now < entry.expiresAt) {
      // A hit counts as recent use, so popular badges outlive one-off lookups.
      this.#store(key, entry);
      return Promise.resolve(this.#fromEntry(key, entry, now));
    }
    const pending = this.#inflight.get(key);
    if (pending !== undefined) {
      return pending;
    }
    const retryAt = this.#failures.get(key);
    if (retryAt !== undefined && now < retryAt) {
      return Promise.resolve(this.#fallback(key, now, retryAt));
    }

    const known = this.#stale(entry, now) !== undefined;
    const admission = this.#dependencies.gate.admit(
      caller,
      now,
      1,
      known ? undefined : this.#dependencies.maxNewStartsPerWindow,
    );
    if (!admission.accepted) {
      return Promise.resolve(
        this.#fallback(key, now, now + admission.retryAfterSeconds * 1_000),
      );
    }
    const run = this.#refresh(key, query)
      .catch(() => this.#fail(key))
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
    if (state === undefined) {
      return this.#fail(key);
    }
    const now = this.#dependencies.now();
    const policy = this.#dependencies.cache;
    const ttlMs =
      state.kind === "online" ? policy.onlineTtlMs : policy.offlineTtlMs;
    // Favicons are large, so fewer of them are kept than results.
    this.#favicons.delete(key);
    let stored = state;
    if (state.kind === "online" && state.favicon !== undefined) {
      const { favicon, ...rest } = state;
      this.#favicons.set(key, favicon);
      trimToBound(this.#favicons, MAX_FAVICONS);
      stored = rest;
    }
    const entry: CacheEntry = {
      expiresAt: now + ttlMs,
      state: stored,
      storedAt: now,
    };
    this.#failures.delete(key);
    this.#store(key, entry);
    return this.#fromEntry(key, entry, now);
  }

  #withFavicon(key: string, state: BadgeState): BadgeState {
    const favicon = this.#favicons.get(key);
    return state.kind === "online" && favicon !== undefined
      ? { ...state, favicon }
      : state;
  }

  #fromEntry(key: string, entry: CacheEntry, now: number): BadgeResolution {
    return {
      maxAgeSeconds: Math.max(1, Math.ceil((entry.expiresAt - now) / 1_000)),
      state: this.#withFavicon(key, entry.state),
    };
  }

  /** Remembers a failed query, so the next ones wait instead of retrying. */
  #fail(key: string): BadgeResolution {
    const now = this.#dependencies.now();
    const retryAt =
      now + (this.#dependencies.cache.failureTtlMs ?? DEFAULT_FAILURE_TTL_MS);
    this.#failures.delete(key);
    this.#failures.set(key, retryAt);
    trimToBound(this.#failures, this.#dependencies.cache.maxEntries);
    return this.#fallback(key, now, retryAt);
  }

  #stale(entry: CacheEntry | undefined, now: number): CacheEntry | undefined {
    return entry !== undefined &&
      now - entry.storedAt <= this.#dependencies.cache.maxStaleMs
      ? entry
      : undefined;
  }

  /**
   * Serves a recent stale result, or `unavailable`, until a fresh query may
   * start again, and never for longer than {@link UNAVAILABLE_MAX_AGE_SECONDS}.
   */
  #fallback(key: string, now: number, retryAt: number): BadgeResolution {
    const maxAgeSeconds = Math.min(
      UNAVAILABLE_MAX_AGE_SECONDS,
      Math.max(1, Math.ceil((retryAt - now) / 1_000)),
    );
    const entry = this.#stale(this.#entries.get(key), now);
    return {
      maxAgeSeconds,
      state:
        entry === undefined
          ? { kind: "unavailable" }
          : this.#withFavicon(key, entry.state),
    };
  }

  #store(key: string, entry: CacheEntry): void {
    // Map order doubles as recency: re-inserting moves the key to the end.
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    trimToBound(this.#entries, this.#dependencies.cache.maxEntries);
  }
}

/** The game's display name, or `QueryHost` for an unknown game. */
export function gameLabel(game: string): string {
  return (
    GAMES.find((definition) => definition.id === game)?.name ?? "QueryHost"
  );
}

/** A weak validator for a rendered body; compression keeps it valid. */
export function weakEtag(body: string): string {
  const digest = createHash("sha256").update(body).digest("base64url");
  return `W/"${digest.slice(0, 27)}"`;
}

/**
 * A rendered response with an ETag, answering a matching `If-None-Match` with
 * an empty `304` and HEAD without a body.
 */
export function validatedResponse(
  request: Request,
  body: string,
  status: number,
  headers: Readonly<Record<string, string>>,
): Response {
  const etag = weakEtag(body);
  if (
    status === 200 &&
    matchesEtag(request.headers.get("if-none-match"), etag)
  ) {
    return new Response(null, {
      headers: { ...headers, ETag: etag },
      status: 304,
    });
  }
  return new Response(request.method === "HEAD" ? null : body, {
    headers: { ...headers, ETag: etag },
    status,
  });
}

function cacheControl(maxAgeSeconds: number): string {
  return `public, max-age=${maxAgeSeconds}`;
}

function svgResponse(
  request: Request,
  label: string,
  state: BadgeState,
  options: BadgeOptions,
  status: number,
  maxAgeSeconds: number,
): Response {
  return validatedResponse(
    request,
    renderBadgeSvg(label, state, options),
    status,
    {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "ETag",
      "Cache-Control": cacheControl(maxAgeSeconds),
      // The SVG can be opened directly as a document; it needs nothing but its
      // own inline presentation attributes and styles.
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  );
}

/** A shields.io endpoint response body. */
export interface ShieldsEndpointBody {
  readonly schemaVersion: 1;
  readonly label: string;
  readonly message: string;
  readonly color: string;
  readonly labelColor: string;
  readonly isError: boolean;
  readonly cacheSeconds: number;
  readonly style?: string;
}

/** The shields.io endpoint body for one badge; colours are hex without `#`. */
export function shieldsEndpointBody(
  label: string,
  state: BadgeState,
  options: BadgeOptions,
  maxAgeSeconds: number,
): ShieldsEndpointBody {
  const palette = badgePalette("dark");
  return {
    cacheSeconds: maxAgeSeconds,
    color: palette[statusToneKey(state)].background.slice(1),
    isError: state.kind === "invalid" || state.kind === "unavailable",
    label,
    labelColor: palette.label.background.slice(1),
    message: badgeMessage(state, options.show),
    schemaVersion: 1,
    ...(options.style === "flat" ? {} : { style: options.style }),
  };
}

function jsonBadgeResponse(
  request: Request,
  label: string,
  state: BadgeState,
  options: BadgeOptions,
  status: number,
  maxAgeSeconds: number,
): Response {
  return validatedResponse(
    request,
    JSON.stringify(shieldsEndpointBody(label, state, options, maxAgeSeconds)),
    status,
    {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Expose-Headers": "ETag",
      "Cache-Control": cacheControl(maxAgeSeconds),
      "Content-Type": "application/json; charset=utf-8",
    },
  );
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

/** How long an `invalid` answer for a malformed path may be reused. */
const INVALID_MAX_AGE_SECONDS = 300;

/**
 * Handles `/api/v1/badge/{game}/{host}[:{port}].svg` and its shields.io
 * endpoint twin, `.json`. Options only change drawing, never the query.
 */
export async function handleBadgeRequest(
  request: Request,
  params: { readonly game: string; readonly file: string },
  service: BadgeService,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Headers": "If-None-Match",
        "Access-Control-Allow-Methods": BADGE_ROUTE_ALLOW,
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Max-Age": "86400",
        Allow: BADGE_ROUTE_ALLOW,
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

  const search = new URL(request.url).searchParams;
  const options = parseBadgeOptions(search);
  const respond = params.file.endsWith(".json")
    ? jsonBadgeResponse
    : svgResponse;
  let input: PlaygroundQueryInput | undefined;
  try {
    input = parseImageRequest(
      params.game,
      params.file,
      params.file.endsWith(".json") ? ".json" : ".svg",
      search,
    );
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      return respond(
        request,
        options.label ?? "QueryHost",
        { kind: "invalid" },
        options,
        400,
        INVALID_MAX_AGE_SECONDS,
      );
    }
    throw error;
  }
  if (input === undefined) {
    return badgeRouteError(
      404,
      "NOT_FOUND",
      "Badge paths end in .svg or .json, as in /api/v1/badge/{game}/{host}.svg.",
    );
  }

  const { maxAgeSeconds, state } = await service.resolve(
    input,
    rateLimitIdentity(callerAddress(request)),
  );
  return respond(
    request,
    options.label ?? gameLabel(input.game),
    state,
    options,
    200,
    maxAgeSeconds,
  );
}
