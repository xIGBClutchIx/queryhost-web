import type { QuerySourceEvent } from "queryhost";

import type {
  JsonObject,
  JsonValue,
  PlaygroundDetectInput,
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
  PlaygroundQueryStreamLine,
} from "./playground-contracts.js";

/** Media type of a streamed query response: one JSON object per line. */
export const QUERY_STREAM_MEDIA_TYPE = "application/x-ndjson";

export type PlaygroundRequestResult =
  | {
      readonly body: PlaygroundProxyErrorResponse;
      readonly kind: "proxy-error";
    }
  | {
      readonly body: PlaygroundQueryResponse;
      readonly kind: "query";
    };

export type PlaygroundDetectResult =
  | {
      readonly body: PlaygroundProxyErrorResponse;
      readonly kind: "proxy-error";
    }
  | {
      /** The detected game's query, with the live-query cache metadata attached. */
      readonly body: PlaygroundQueryResponse;
      readonly game: PlaygroundGameDefinition;
      readonly kind: "detected";
      /** Port of the probe that identified the game. */
      readonly matchedPort?: number;
    }
  | {
      /** A detection error code, such as `NOT_DETECTED`, and its message. */
      readonly code: string;
      readonly kind: "undetected";
      readonly message: string;
    };

export type PlaygroundFetcher = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;

function isObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptional(
  value: JsonValue | undefined,
  type: "boolean" | "number" | "string",
): boolean {
  return value === undefined || typeof value === type;
}

function isArrayOf(
  value: JsonValue | undefined,
  item: (entry: JsonValue) => boolean,
): boolean {
  return Array.isArray(value) && value.every(item);
}

function isCodeMessage(value: JsonValue | undefined): boolean {
  return (
    isObject(value) &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

/** A query failure; `source` names the source the game profile required. */
function isQueryError(value: JsonValue | undefined): boolean {
  return (
    isCodeMessage(value) &&
    isObject(value) &&
    isOptional(value.source, "string")
  );
}

function isSource(value: JsonValue): boolean {
  return (
    isObject(value) &&
    typeof value.source === "string" &&
    typeof value.status === "string" &&
    isOptional(value.rttMs, "number")
  );
}

function isServer(value: JsonValue | undefined): boolean {
  if (!isObject(value)) return false;
  const players = value.players;
  return (
    isOptional(value.name, "string") &&
    isOptional(value.map, "string") &&
    isOptional(value.version, "string") &&
    isOptional(value.password, "boolean") &&
    isOptional(value.queryRttMs, "number") &&
    (players === undefined ||
      (isObject(players) &&
        isOptional(players.online, "number") &&
        isOptional(players.max, "number")))
  );
}

/**
 * Checks every field the playground renders, so a malformed upstream body becomes a
 * request error instead of a render failure.
 */
export function isPlaygroundQueryResponse(
  value: JsonValue,
): value is JsonObject & PlaygroundQueryResponse {
  if (!isObject(value)) return false;
  const cache = value.cache;
  const shared =
    typeof value.game === "string" &&
    typeof value.durationMs === "number" &&
    isArrayOf(value.sources, isSource) &&
    isArrayOf(value.warnings, isCodeMessage) &&
    isObject(cache) &&
    typeof cache.status === "string" &&
    typeof cache.ageMs === "number" &&
    typeof cache.ttlMs === "number";
  if (!shared) return false;
  if (value.ok === false) return isQueryError(value.error);
  return (
    value.ok === true &&
    typeof value.partial === "boolean" &&
    isServer(value.server) &&
    isObject(value.data) &&
    (value.rawData === undefined || isObject(value.rawData))
  );
}

/**
 * Validates one line of a streamed query response. Throws when the line is not a source event
 * or a renderable result.
 */
export function parseQueryStreamLine(line: string): PlaygroundQueryStreamLine {
  const value = JSON.parse(line) as JsonValue;
  if (isObject(value)) {
    if (value.type === "started" && typeof value.source === "string") {
      return value as JsonObject & PlaygroundQueryStreamLine;
    }
    if (
      value.type === "completed" &&
      value.report !== undefined &&
      isSource(value.report)
    ) {
      return value as JsonObject & PlaygroundQueryStreamLine;
    }
    if (
      value.type === "result" &&
      value.result !== undefined &&
      isPlaygroundQueryResponse(value.result)
    ) {
      return { result: value.result, type: "result" };
    }
  }
  throw new Error("The query stream contained an unexpected line.");
}

/** Splits NDJSON bytes into complete, non-empty lines across chunk boundaries. */
export class QueryStreamLineSplitter {
  readonly #decoder = new TextDecoder();
  #pending = "";

  public push(chunk: Uint8Array): readonly string[] {
    this.#pending += this.#decoder.decode(chunk, { stream: true });
    const lines = this.#pending.split("\n");
    this.#pending = lines.pop() ?? "";
    return lines.filter((line) => line.trim().length > 0);
  }

  public flush(): readonly string[] {
    const rest = this.#pending + this.#decoder.decode();
    this.#pending = "";
    return rest.trim().length > 0 ? [rest] : [];
  }
}

export function isPlaygroundProxyErrorResponse(
  value: JsonValue,
): value is JsonObject & PlaygroundProxyErrorResponse {
  return isObject(value) && isCodeMessage(value.error);
}

const UNEXPECTED_RESPONSE =
  "The QueryHost web service returned an unexpected response.";

/** Reports the progress lines of a streamed query until its single result line. */
async function readQueryStream(
  body: ReadableStream<Uint8Array>,
  onProgress: (event: QuerySourceEvent) => void,
): Promise<PlaygroundQueryResponse> {
  const reader = body.getReader();
  const splitter = new QueryStreamLineSplitter();
  let result: PlaygroundQueryResponse | undefined;
  const handle = (lines: readonly string[]): void => {
    for (const line of lines) {
      if (result !== undefined) throw new Error(UNEXPECTED_RESPONSE);
      const parsed = parseQueryStreamLine(line);
      if (parsed.type === "result") {
        result = parsed.result;
      } else {
        onProgress(parsed);
      }
    }
  };
  try {
    for (
      let chunk = await reader.read();
      !chunk.done;
      chunk = await reader.read()
    ) {
      handle(splitter.push(chunk.value));
    }
    handle(splitter.flush());
  } finally {
    reader.releaseLock();
  }
  if (result === undefined) throw new Error(UNEXPECTED_RESPONSE);
  return result;
}

/**
 * Sends one browser query through the public same-origin boundary. With `onProgress`, the
 * query streams and each source's progress is reported before the result returns.
 */
export async function requestPlaygroundQuery(
  input: PlaygroundQueryInput,
  signal: AbortSignal,
  fetcher: PlaygroundFetcher = fetch,
  onProgress?: (event: QuerySourceEvent) => void,
): Promise<PlaygroundRequestResult> {
  const response = await fetcher("/api/query", {
    body: JSON.stringify(input),
    headers: {
      ...(onProgress === undefined
        ? {}
        : { Accept: `${QUERY_STREAM_MEDIA_TYPE}, application/json` }),
      "Content-Type": "application/json",
    },
    method: "POST",
    signal,
  });
  if (
    onProgress !== undefined &&
    response.ok &&
    response.body !== null &&
    response.headers.get("content-type")?.startsWith(QUERY_STREAM_MEDIA_TYPE)
  ) {
    try {
      return {
        body: await readQueryStream(response.body, onProgress),
        kind: "query",
      };
    } catch (error) {
      // Cancellation keeps its own error; anything else is a malformed stream.
      if (signal.aborted) throw error;
      throw new Error(UNEXPECTED_RESPONSE);
    }
  }
  const body = JSON.parse(await response.text()) as JsonValue;
  if (!response.ok) {
    if (!isPlaygroundProxyErrorResponse(body)) {
      throw new Error(UNEXPECTED_RESPONSE);
    }
    return { body, kind: "proxy-error" };
  }
  if (!isPlaygroundQueryResponse(body)) {
    throw new Error(UNEXPECTED_RESPONSE);
  }
  return { body, kind: "query" };
}

// Detection results are never cached, so the query inside one is always live.
const LIVE_QUERY = { ageMs: 0, status: "miss", ttlMs: 0 } as const;

function matchedProbePort(probes: JsonValue | undefined): number | undefined {
  if (!Array.isArray(probes)) return undefined;
  for (const probe of probes) {
    if (
      isObject(probe) &&
      probe.status === "matched" &&
      typeof probe.port === "number"
    ) {
      return probe.port;
    }
  }
  return undefined;
}

/**
 * Sends one browser detection through the same-origin boundary. A detected
 * game must be one the page lists, and its query must pass the same checks as
 * a direct query before the playground renders it.
 */
export async function requestPlaygroundDetect(
  input: PlaygroundDetectInput,
  games: readonly PlaygroundGameDefinition[],
  signal: AbortSignal,
  fetcher: PlaygroundFetcher = fetch,
): Promise<PlaygroundDetectResult> {
  const response = await fetcher("/api/detect", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const body = JSON.parse(await response.text()) as JsonValue;
  if (!response.ok) {
    if (!isPlaygroundProxyErrorResponse(body)) {
      throw new Error(UNEXPECTED_RESPONSE);
    }
    return { body, kind: "proxy-error" };
  }
  if (!isObject(body) || !Array.isArray(body.probes)) {
    throw new Error(UNEXPECTED_RESPONSE);
  }
  if (body.ok === false && isCodeMessage(body.error) && isObject(body.error)) {
    const { code, message } = body.error;
    if (typeof code === "string" && typeof message === "string") {
      return { code, kind: "undetected", message };
    }
  }
  const game = games.find((candidate) => candidate.id === body.game);
  const result = body.result;
  if (body.ok !== true || game === undefined || !isObject(result)) {
    throw new Error(UNEXPECTED_RESPONSE);
  }
  const query: JsonValue = { ...result, cache: LIVE_QUERY };
  if (!isPlaygroundQueryResponse(query) || query.game !== game.id) {
    throw new Error(UNEXPECTED_RESPONSE);
  }
  const matchedPort = matchedProbePort(body.probes);
  return {
    body: query,
    game,
    kind: "detected",
    ...(matchedPort === undefined ? {} : { matchedPort }),
  };
}
