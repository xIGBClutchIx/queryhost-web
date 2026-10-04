import type {
  JsonObject,
  JsonValue,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "./playground-contracts.js";

export type PlaygroundRequestResult =
  | {
      readonly body: PlaygroundProxyErrorResponse;
      readonly kind: "proxy-error";
      readonly raw: string;
    }
  | {
      readonly body: PlaygroundQueryResponse;
      readonly kind: "query";
      readonly raw: string;
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
  if (value.ok === false) return isCodeMessage(value.error);
  return (
    value.ok === true &&
    typeof value.partial === "boolean" &&
    isServer(value.server) &&
    isObject(value.data) &&
    (value.rawData === undefined || isObject(value.rawData))
  );
}

export function isPlaygroundProxyErrorResponse(
  value: JsonValue,
): value is JsonObject & PlaygroundProxyErrorResponse {
  return isObject(value) && isCodeMessage(value.error);
}

const UNEXPECTED_RESPONSE =
  "The QueryHost web service returned an unexpected response.";

/** Sends one browser query through the public same-origin boundary. */
export async function requestPlaygroundQuery(
  input: PlaygroundQueryInput,
  signal: AbortSignal,
  fetcher: PlaygroundFetcher = fetch,
): Promise<PlaygroundRequestResult> {
  const response = await fetcher("/api/query", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const raw = await response.text();
  const body = JSON.parse(raw) as JsonValue;
  if (!response.ok) {
    if (!isPlaygroundProxyErrorResponse(body)) {
      throw new Error(UNEXPECTED_RESPONSE);
    }
    return { body, kind: "proxy-error", raw };
  }
  if (!isPlaygroundQueryResponse(body)) {
    throw new Error(UNEXPECTED_RESPONSE);
  }
  return { body, kind: "query", raw };
}
