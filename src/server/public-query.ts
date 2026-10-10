import { createHash } from "node:crypto";

import {
  canonicalGameId,
  isGameInputId,
  query,
  type GameId,
  type QueryMode,
  type QueryResult,
  type QuerySourceEvent,
} from "queryhost";

import type {
  HostedCacheMetadata,
  JsonObject,
  JsonValue,
  PlaygroundProxyErrorCode,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryStreamLine,
} from "../lib/playground-contracts.js";
import {
  parseQueryStreamLine,
  QUERY_STREAM_MEDIA_TYPE,
  QueryStreamLineSplitter,
} from "../lib/playground-query.js";
import { ProxyGate, type ProxyGatePolicy } from "./proxy-gate.js";
import { readBoundedText } from "./bounded-text.js";
import { SurfaceUsage } from "./usage-stats.js";

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
const MAX_UPSTREAM_BYTES = 2_097_152;

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
  readonly onSource?: (event: QuerySourceEvent) => void;
}

export type LocalQueryRunner = (input: LocalQueryInput) => Promise<QueryResult>;

/**
 * What running an admitted query needs, without the admission gate. Usage is
 * optional so callers outside the two query surfaces stay out of their counts.
 */
export type QueryTargetDependencies = Pick<
  PublicQueryDependencies,
  "config" | "fetcher" | "queryRunner"
> & { readonly usage?: SurfaceUsage };

export interface PublicQueryDependencies {
  readonly config: PublicQueryConfig;
  readonly fetcher: ProxyFetcher;
  readonly gate: ProxyGate;
  readonly queryRunner: LocalQueryRunner;
  readonly usage: SurfaceUsage;
}

/** A caller-safe validation failure from {@link parseQueryFields}. */
export class PublicQueryInputError extends Error {
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

/** Reads an optional bounded integer setting, failing fast on bad values. */
export function integerEnvironment(
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

/**
 * Reads one caller-boundary policy. The playground uses `QUERYHOST_WEB_`;
 * the public API reads the same names under its own prefix so the two
 * surfaces never share a budget.
 */
export function loadProxyGatePolicy(
  environment: NodeJS.ProcessEnv = process.env,
  prefix = "QUERYHOST_WEB_",
): ProxyGatePolicy {
  const maxStartsPerWindow = integerEnvironment(
    environment,
    `${prefix}MAX_STARTS_PER_WINDOW`,
    60,
    1,
    10_000,
  );
  const maxStartsPerCaller = integerEnvironment(
    environment,
    `${prefix}MAX_STARTS_PER_CALLER`,
    8,
    1,
    1_000,
  );
  if (maxStartsPerCaller > maxStartsPerWindow) {
    throw new RangeError(
      `${prefix}MAX_STARTS_PER_CALLER cannot exceed ${prefix}MAX_STARTS_PER_WINDOW.`,
    );
  }
  return {
    maxActive: integerEnvironment(
      environment,
      `${prefix}MAX_ACTIVE`,
      8,
      1,
      128,
    ),
    maxStartsPerCaller,
    maxStartsPerWindow,
    maxTrackedCallers: integerEnvironment(
      environment,
      `${prefix}MAX_TRACKED_CALLERS`,
      2_048,
      1,
      100_000,
    ),
    windowMs: integerEnvironment(
      environment,
      `${prefix}START_WINDOW_MS`,
      60_000,
      1_000,
      3_600_000,
    ),
  };
}

export function jsonResponse(
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

export function parseJson(text: string): JsonValue {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    throw new PublicQueryInputError("The request body must be valid JSON.");
  }
}

export function jsonObject(value: JsonValue): JsonObject {
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

export function optionalInteger(
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

export function normalizedHost(value: JsonValue | undefined): string {
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

export function queryMode(value: JsonValue | undefined): QueryMode | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value !== "summary" && value !== "full") {
    throw new PublicQueryInputError("mode must be summary or full.");
  }
  return value;
}

function parseInput(text: string): PlaygroundQueryInput {
  return parseQueryFields(jsonObject(parseJson(text)));
}

/**
 * Validates query fields from any public surface into the input the query
 * service accepts. Throws {@link PublicQueryInputError} with a caller-safe message.
 */
export function parseQueryFields(body: JsonObject): PlaygroundQueryInput {
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
  if (game === "a2s" && port === undefined) {
    throw new PublicQueryInputError(
      "port is required for generic A2S queries.",
    );
  }
  if (game === "a2s" && queryPort !== undefined) {
    throw new PublicQueryInputError(
      "Use port as the query destination for generic A2S queries.",
    );
  }
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

export function callerFingerprint(request: Request): string {
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

/**
 * Runs one validated, already admitted query on the configured target. The
 * deadline is bounded by the service's upstream timeout; transport failures
 * become `UPSTREAM_UNAVAILABLE` instead of escaping.
 */
export async function forwardQuery(
  input: PlaygroundQueryInput,
  dependencies: QueryTargetDependencies,
  callerSignal: AbortSignal,
): Promise<Response> {
  try {
    const signal = AbortSignal.any([
      callerSignal,
      AbortSignal.timeout(dependencies.config.upstreamTimeoutMs),
    ]);
    if (dependencies.config.target.kind === "local") {
      const result = await dependencies.queryRunner({ ...input, signal });
      dependencies.usage?.recordForwarded(200, "miss");
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
      dependencies.usage?.recordUnavailable();
      return jsonResponse(
        502,
        "UPSTREAM_INVALID",
        "The query service returned an invalid response.",
      );
    }
    const body = await readBoundedText(
      upstream.body,
      MAX_UPSTREAM_BYTES,
      signal,
    );
    dependencies.usage?.recordForwarded(
      upstream.status,
      upstream.headers.get("x-queryhost-cache"),
    );
    return new Response(body, {
      headers: forwardedHeaders(upstream),
      status: upstream.status,
    });
  } catch {
    dependencies.usage?.recordUnavailable();
    return jsonResponse(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The query service is temporarily unavailable.",
    );
  }
}

/** True when `Accept` lists NDJSON without refusing it through `q=0`. */
export function acceptsQueryStream(headers: Headers): boolean {
  const accept = headers.get("accept");
  if (accept === null) {
    return false;
  }
  return accept.split(",").some((range) => {
    const [type = "", ...parameters] = range.split(";");
    return (
      type.trim().toLowerCase() === QUERY_STREAM_MEDIA_TYPE &&
      !parameters.some((parameter) =>
        /^\s*q\s*=\s*0(?:\.0{0,3})?\s*$/iu.test(parameter),
      )
    );
  });
}

function streamHeaders(): Headers {
  return new Headers({
    "Cache-Control": "no-store",
    "Content-Type": `${QUERY_STREAM_MEDIA_TYPE}; charset=utf-8`,
    // Proxies that buffer by default must pass each progress line through as written.
    "X-Accel-Buffering": "no",
  });
}

/** A local result has the library's own typed data rather than the relayed JSON shape. */
type LocalQueryStreamLine =
  | QuerySourceEvent
  | {
      readonly type: "result";
      readonly result: QueryResult & { readonly cache: HostedCacheMetadata };
    };

function encodeLine(
  line: LocalQueryStreamLine | PlaygroundQueryStreamLine,
): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(line)}\n`);
}

/** Streams a local library query, used when no hosted API is configured. */
function localQueryStream(
  input: PlaygroundQueryInput,
  dependencies: QueryTargetDependencies,
  signal: AbortSignal,
  finish: () => void,
): Response {
  // A caller that stops reading cancels the query and frees its admission slot at once.
  const cancelled = new AbortController();
  let finished = false;
  const end = (): void => {
    if (finished) return;
    finished = true;
    finish();
  };
  const body = new ReadableStream<Uint8Array>({
    cancel: () => {
      cancelled.abort();
      end();
    },
    start: (controller) => {
      // A cancelled stream rejects further writes.
      const write = (line: LocalQueryStreamLine): void => {
        try {
          controller.enqueue(encodeLine(line));
        } catch {
          // The caller has gone.
        }
      };
      void dependencies
        .queryRunner({
          ...input,
          onSource: write,
          signal: AbortSignal.any([signal, cancelled.signal]),
        })
        .then(
          (result) => {
            dependencies.usage?.recordForwarded(200, "miss");
            write({
              result: {
                ...result,
                cache: { ageMs: 0, status: "miss", ttlMs: 0 },
              },
              type: "result",
            });
            try {
              controller.close();
            } catch {
              // Already cancelled.
            }
          },
          () => {
            dependencies.usage?.recordUnavailable();
            try {
              controller.error(new Error("The local query failed."));
            } catch {
              // Already cancelled.
            }
          },
        )
        .finally(end);
    },
  });
  return new Response(body, { headers: streamHeaders(), status: 200 });
}

/**
 * Relays an upstream NDJSON query stream line by line. Only validated lines pass, the total is
 * bounded, and `finish` runs once when the relay ends, fails, is cancelled, or times out.
 */
function relayQueryStream(
  upstream: ReadableStream<Uint8Array>,
  dependencies: QueryTargetDependencies,
  signal: AbortSignal,
  finish: () => void,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const splitter = new QueryStreamLineSplitter();
  let totalBytes = 0;
  let sawResult = false;
  let finished = false;
  const end = (failed: boolean): void => {
    if (finished) return;
    finished = true;
    signal.removeEventListener("abort", onAbort);
    if (failed) dependencies.usage?.recordUnavailable();
    reader.cancel().catch(() => undefined);
    finish();
  };
  const onAbort = (): void => {
    end(!sawResult);
  };
  signal.addEventListener("abort", onAbort, { once: true });

  const relay = (
    controller: ReadableStreamDefaultController<Uint8Array>,
    lines: readonly string[],
  ): void => {
    for (const text of lines) {
      if (sawResult) throw new Error("A line followed the result.");
      const line = parseQueryStreamLine(text);
      if (line.type === "result") {
        sawResult = true;
        dependencies.usage?.recordForwarded(200, line.result.cache.status);
      }
      controller.enqueue(encodeLine(line));
    }
  };

  return new ReadableStream<Uint8Array>({
    cancel: () => {
      end(!sawResult);
    },
    pull: async (controller) => {
      try {
        const chunk = await reader.read();
        if (chunk.done) {
          relay(controller, splitter.flush());
          if (!sawResult) throw new Error("The stream ended without a result.");
          end(false);
          controller.close();
          return;
        }
        totalBytes += chunk.value.byteLength;
        if (totalBytes > MAX_UPSTREAM_BYTES) {
          throw new Error("The stream is too large.");
        }
        relay(controller, splitter.push(chunk.value));
      } catch {
        end(!sawResult);
        controller.error(new Error("The query stream failed."));
      }
    },
  });
}

/**
 * Like {@link forwardQuery}, but asks for source progress as an NDJSON stream. Refusals and
 * failures before the stream starts stay ordinary JSON responses. `finish` runs exactly once,
 * after the stream ends or immediately when no stream is returned.
 */
export async function forwardQueryStream(
  input: PlaygroundQueryInput,
  dependencies: QueryTargetDependencies,
  callerSignal: AbortSignal,
  finish: () => void,
): Promise<Response> {
  const signal = AbortSignal.any([
    callerSignal,
    AbortSignal.timeout(dependencies.config.upstreamTimeoutMs),
  ]);
  if (dependencies.config.target.kind === "local") {
    return localQueryStream(input, dependencies, signal, finish);
  }

  let streaming = false;
  try {
    const target = dependencies.config.target;
    const upstream = await dependencies.fetcher(`${target.apiBaseUrl}/query`, {
      body: JSON.stringify(input),
      headers: {
        Accept: `${QUERY_STREAM_MEDIA_TYPE}, application/json`,
        "Content-Type": "application/json",
        [ORIGIN_TOKEN_HEADER]: target.apiOriginToken,
      },
      method: "POST",
      redirect: "error",
      signal,
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (
      upstream.status === 200 &&
      upstream.body !== null &&
      contentType.startsWith(QUERY_STREAM_MEDIA_TYPE)
    ) {
      streaming = true;
      return new Response(
        relayQueryStream(upstream.body, dependencies, signal, finish),
        { headers: streamHeaders(), status: 200 },
      );
    }
    if (!contentType.startsWith("application/json")) {
      dependencies.usage?.recordUnavailable();
      return jsonResponse(
        502,
        "UPSTREAM_INVALID",
        "The query service returned an invalid response.",
      );
    }
    // Errors such as an overloaded query service, or an API without streaming, answer in JSON.
    const body = await readBoundedText(
      upstream.body,
      MAX_UPSTREAM_BYTES,
      signal,
    );
    dependencies.usage?.recordForwarded(
      upstream.status,
      upstream.headers.get("x-queryhost-cache"),
    );
    return new Response(body, {
      headers: forwardedHeaders(upstream),
      status: upstream.status,
    });
  } catch {
    dependencies.usage?.recordUnavailable();
    return jsonResponse(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The query service is temporarily unavailable.",
    );
  } finally {
    if (!streaming) finish();
  }
}

/**
 * Applies the method, media-type, and body-size checks every public JSON route
 * shares. Returns the body text, or the error response already counted as invalid.
 */
export async function readJsonRequest(
  request: Request,
  maxBodyBytes: number,
  usage: SurfaceUsage,
  noun: string,
): Promise<string | Response> {
  if (request.method !== "POST") {
    usage.recordInvalid();
    return jsonResponse(405, "METHOD_NOT_ALLOWED", `Use POST for ${noun}.`);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    usage.recordInvalid();
    return jsonResponse(
      415,
      "BAD_REQUEST",
      `${noun.charAt(0).toUpperCase()}${noun.slice(1)} require application/json.`,
    );
  }

  try {
    return await readBoundedBody(request, maxBodyBytes);
  } catch (error) {
    if (error instanceof PublicQueryBodyError) {
      usage.recordInvalid();
      return jsonResponse(
        error.code === "BODY_TOO_LARGE" ? 413 : 400,
        error.code,
        error.message,
      );
    }
    throw error;
  }
}

/** Validates, admits, and forwards one playground or public API query. */
export async function handlePublicQuery(
  request: Request,
  dependencies: PublicQueryDependencies,
): Promise<Response> {
  const usage = dependencies.usage;
  const text = await readJsonRequest(
    request,
    dependencies.config.maxBodyBytes,
    usage,
    "queries",
  );
  if (typeof text !== "string") {
    return text;
  }

  let input: PlaygroundQueryInput;
  try {
    input = parseInput(text);
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      usage.recordInvalid();
      return jsonResponse(400, "BAD_REQUEST", error.message);
    }
    throw error;
  }

  const admission = dependencies.gate.admit(callerFingerprint(request));
  if (!admission.accepted) {
    usage.recordRateLimited(admission.reason);
    return jsonResponse(
      429,
      "RATE_LIMITED",
      "Too many queries. Wait before trying again.",
      admission.retryAfterSeconds,
    );
  }

  if (acceptsQueryStream(request.headers)) {
    // A stream holds its admission slot until the last line is written.
    return forwardQueryStream(input, dependencies, request.signal, () => {
      admission.release();
    });
  }
  try {
    return await forwardQuery(input, dependencies, request.signal);
  } finally {
    admission.release();
  }
}

export function createDefaultPublicQueryDependencies(
  environment: NodeJS.ProcessEnv = process.env,
  gatePrefix?: string,
): PublicQueryDependencies {
  return {
    config: loadPublicQueryConfig(environment),
    fetcher: fetch,
    gate: new ProxyGate(loadProxyGatePolicy(environment, gatePrefix)),
    queryRunner: (input) => query(input),
    usage: new SurfaceUsage(),
  };
}
