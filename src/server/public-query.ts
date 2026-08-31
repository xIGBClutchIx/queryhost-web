import { createHash } from "node:crypto";

import {
  canonicalGameId,
  isGameInputId,
  query,
  type GameId,
  type QueryMode,
  type QueryResult,
} from "queryhost";

import type {
  JsonObject,
  JsonValue,
  PlaygroundProxyErrorCode,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
} from "../lib/playground-contracts.js";
import { ProxyGate, type ProxyGatePolicy } from "./proxy-gate.js";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "game",
  "host",
  "mode",
  "port",
  "queryPort",
  "timeoutMs",
]);
const ORIGIN_TOKEN_HEADER = "x-queryhost-origin-token";
const MAX_HOST_LENGTH = 253;

export type PublicQueryTarget =
  | {
      readonly kind: "hosted";
      readonly apiBaseUrl: string;
      readonly apiOriginToken: string;
    }
  | { readonly kind: "local" };

export interface PublicQueryConfig {
  readonly maxBodyBytes: number;
  readonly target: PublicQueryTarget;
  readonly upstreamTimeoutMs: number;
}

export type ProxyFetcher = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;

export interface LocalQueryInput extends PlaygroundQueryInput {
  readonly signal: AbortSignal;
}

export type LocalQueryRunner = (input: LocalQueryInput) => Promise<QueryResult>;

export interface PublicQueryDependencies {
  readonly config: PublicQueryConfig;
  readonly fetcher: ProxyFetcher;
  readonly gate: ProxyGate;
  readonly queryRunner: LocalQueryRunner;
}

class PublicQueryInputError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "PublicQueryInputError";
  }
}

type PublicQueryBodyErrorCode = "BAD_REQUEST" | "BODY_TOO_LARGE";

class PublicQueryBodyError extends Error {
  public readonly code: PublicQueryBodyErrorCode;

  public constructor(code: PublicQueryBodyErrorCode, message: string) {
    super(message);
    this.name = "PublicQueryBodyError";
    this.code = code;
  }
}

function integerEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = environment[name];
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

function hostedQueryTarget(environment: NodeJS.ProcessEnv): PublicQueryTarget {
  const raw = environment["QUERYHOST_API_BASE_URL"];
  if (raw === undefined) {
    if (environment["NODE_ENV"] === "production") {
      throw new Error("QUERYHOST_API_BASE_URL is required in production.");
    }
    if (environment["QUERYHOST_API_ORIGIN_TOKEN"] !== undefined) {
      throw new Error(
        "QUERYHOST_API_ORIGIN_TOKEN requires QUERYHOST_API_BASE_URL.",
      );
    }
    return { kind: "local" };
  }
  const url = new URL(raw);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username.length > 0 ||
    url.password.length > 0 ||
    url.search.length > 0 ||
    url.hash.length > 0 ||
    (url.pathname !== "/" && url.pathname.length > 0)
  ) {
    throw new Error("QUERYHOST_API_BASE_URL must be an HTTP origin URL.");
  }
  const token = environment["QUERYHOST_API_ORIGIN_TOKEN"];
  if (token === undefined || token.length < 32 || token.length > 256) {
    throw new Error(
      "QUERYHOST_API_ORIGIN_TOKEN must contain 32 through 256 characters.",
    );
  }
  return {
    apiBaseUrl: url.origin,
    apiOriginToken: token,
    kind: "hosted",
  };
}

export function loadPublicQueryConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PublicQueryConfig {
  return {
    maxBodyBytes: integerEnvironment(
      environment,
      "QUERYHOST_WEB_MAX_BODY_BYTES",
      2_048,
      256,
      16_384,
    ),
    target: hostedQueryTarget(environment),
    upstreamTimeoutMs: integerEnvironment(
      environment,
      "QUERYHOST_WEB_UPSTREAM_TIMEOUT_MS",
      7_000,
      1_000,
      15_000,
    ),
  };
}

export function loadProxyGatePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): ProxyGatePolicy {
  const maxStartsPerWindow = integerEnvironment(
    environment,
    "QUERYHOST_WEB_MAX_STARTS_PER_WINDOW",
    60,
    1,
    10_000,
  );
  const maxStartsPerCaller = integerEnvironment(
    environment,
    "QUERYHOST_WEB_MAX_STARTS_PER_CALLER",
    8,
    1,
    1_000,
  );
  if (maxStartsPerCaller > maxStartsPerWindow) {
    throw new RangeError(
      "QUERYHOST_WEB_MAX_STARTS_PER_CALLER cannot exceed QUERYHOST_WEB_MAX_STARTS_PER_WINDOW.",
    );
  }
  return {
    maxActive: integerEnvironment(
      environment,
      "QUERYHOST_WEB_MAX_ACTIVE",
      8,
      1,
      128,
    ),
    maxStartsPerCaller,
    maxStartsPerWindow,
    maxTrackedCallers: integerEnvironment(
      environment,
      "QUERYHOST_WEB_MAX_TRACKED_CALLERS",
      2_048,
      1,
      100_000,
    ),
    windowMs: integerEnvironment(
      environment,
      "QUERYHOST_WEB_START_WINDOW_MS",
      60_000,
      1_000,
      3_600_000,
    ),
  };
}

function jsonResponse(
  status: number,
  code: PlaygroundProxyErrorCode,
  message: string,
  retryAfterSeconds?: number,
): Response {
  const body: PlaygroundProxyErrorResponse = { error: { code, message } };
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  if (retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return new Response(JSON.stringify(body), { headers, status });
}

function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw new PublicQueryInputError("The request body must be valid JSON.");
  }
}

function jsonObject(value: JsonValue): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PublicQueryInputError("The request body must be a JSON object.");
  }
  return value;
}

async function readBoundedBody(
  request: Request,
  maxBytes: number,
): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/u.test(declaredLength)) {
      throw new PublicQueryBodyError(
        "BAD_REQUEST",
        "Content-Length is invalid.",
      );
    }
    const bytes = Number(declaredLength);
    if (!Number.isSafeInteger(bytes)) {
      throw new PublicQueryBodyError(
        "BAD_REQUEST",
        "Content-Length is invalid.",
      );
    }
    if (bytes > maxBytes) {
      throw new PublicQueryBodyError(
        "BODY_TOO_LARGE",
        "The query request is too large.",
      );
    }
  }

  if (request.body === null) {
    return "";
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      totalBytes += result.value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // Cancellation is best-effort; the size violation still determines the response.
        }
        throw new PublicQueryBodyError(
          "BODY_TOO_LARGE",
          "The query request is too large.",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function optionalInteger(
  value: JsonValue | undefined,
  name: string,
  minimum: number,
  maximum: number,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new PublicQueryInputError(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  }
  return value;
}

function normalizedHost(value: JsonValue | undefined): string {
  if (typeof value !== "string") {
    throw new PublicQueryInputError(
      "host must be a hostname or IP literal string.",
    );
  }
  const trimmed = value.trim();
  const host = trimmed.endsWith(".") ? trimmed.slice(0, -1) : trimmed;
  if (
    host.length === 0 ||
    host.length > MAX_HOST_LENGTH ||
    /[\s/?#@]/u.test(host) ||
    host.includes("[") ||
    host.includes("]") ||
    host.includes("%")
  ) {
    throw new PublicQueryInputError(
      "host must be a plain hostname or IP literal without URL syntax.",
    );
  }
  return host.toLowerCase();
}

function queryMode(value: JsonValue | undefined): QueryMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "summary" && value !== "full") {
    throw new PublicQueryInputError("mode must be summary or full.");
  }
  return value;
}

function parseInput(text: string): PlaygroundQueryInput {
  const body = jsonObject(parseJson(text));
  const extraField = Object.keys(body).find((key) => !ALLOWED_FIELDS.has(key));
  if (extraField !== undefined) {
    throw new PublicQueryInputError(
      `Unsupported request field: ${extraField}.`,
    );
  }

  const gameValue = body["game"];
  if (typeof gameValue !== "string" || !isGameInputId(gameValue)) {
    throw new PublicQueryInputError(
      "game must be a supported game ID or alias.",
    );
  }
  const game: GameId = canonicalGameId(gameValue);
  const port = optionalInteger(body["port"], "port", 1, 65_535);
  const queryPort = optionalInteger(body["queryPort"], "queryPort", 1, 65_535);
  const mode = queryMode(body["mode"]);
  const timeoutMs = optionalInteger(body["timeoutMs"], "timeoutMs", 1, 5_000);

  return {
    game,
    host: normalizedHost(body["host"]),
    ...(port === undefined ? {} : { port }),
    ...(queryPort === undefined ? {} : { queryPort }),
    ...(mode === undefined ? {} : { mode }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

function callerFingerprint(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const address =
    request.headers.get("x-real-ip")?.trim() ||
    forwarded?.split(",", 1)[0]?.trim() ||
    "anonymous";
  return createHash("sha256").update(address.slice(0, 128)).digest("hex");
}

function forwardedHeaders(upstream: Response): Headers {
  const headers = new Headers({
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  for (const name of ["Age", "Retry-After", "x-queryhost-cache"]) {
    const value = upstream.headers.get(name);
    if (value !== null) {
      headers.set(name, value);
    }
  }
  return headers;
}

function localQueryResponse(result: QueryResult): Response {
  return new Response(
    JSON.stringify({
      ...result,
      cache: { ageMs: 0, status: "miss", ttlMs: 0 },
    }),
    {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "application/json; charset=utf-8",
        "x-queryhost-cache": "miss",
      },
      status: 200,
    },
  );
}

/** Validates, admits, and forwards one same-origin playground query. */
export async function handlePublicQuery(
  request: Request,
  dependencies: PublicQueryDependencies,
): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse(
      405,
      "METHOD_NOT_ALLOWED",
      "Use POST for playground queries.",
    );
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return jsonResponse(
      415,
      "BAD_REQUEST",
      "Playground queries require application/json.",
    );
  }

  let text: string;
  try {
    text = await readBoundedBody(request, dependencies.config.maxBodyBytes);
  } catch (error) {
    if (error instanceof PublicQueryBodyError) {
      return jsonResponse(
        error.code === "BODY_TOO_LARGE" ? 413 : 400,
        error.code,
        error.message,
      );
    }
    throw error;
  }

  let input: PlaygroundQueryInput;
  try {
    input = parseInput(text);
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      return jsonResponse(400, "BAD_REQUEST", error.message);
    }
    throw error;
  }

  const admission = dependencies.gate.admit(callerFingerprint(request));
  if (!admission.accepted) {
    return jsonResponse(
      429,
      "RATE_LIMITED",
      "Too many playground queries. Wait before trying again.",
      admission.retryAfterSeconds,
    );
  }

  try {
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(dependencies.config.upstreamTimeoutMs),
    ]);
    if (dependencies.config.target.kind === "local") {
      const result = await dependencies.queryRunner({ ...input, signal });
      return localQueryResponse(result);
    }

    const target = dependencies.config.target;
    const upstream = await dependencies.fetcher(`${target.apiBaseUrl}/query`, {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        [ORIGIN_TOKEN_HEADER]: target.apiOriginToken,
      },
      method: "POST",
      redirect: "error",
      signal,
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/json")) {
      return jsonResponse(
        502,
        "UPSTREAM_INVALID",
        "The query service returned an invalid response.",
      );
    }
    return new Response(await upstream.text(), {
      headers: forwardedHeaders(upstream),
      status: upstream.status,
    });
  } catch {
    return jsonResponse(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The query service is temporarily unavailable.",
    );
  } finally {
    admission.release();
  }
}

export function createDefaultPublicQueryDependencies(
  environment: NodeJS.ProcessEnv = process.env,
): PublicQueryDependencies {
  return {
    config: loadPublicQueryConfig(environment),
    fetcher: fetch,
    gate: new ProxyGate(loadProxyGatePolicy(environment)),
    queryRunner: (input) => query(input),
  };
}
