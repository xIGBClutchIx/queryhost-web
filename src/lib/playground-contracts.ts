import type {
  GameCapability,
  GameId,
  QueryError,
  QueryMode,
  QuerySource,
  QuerySourceEvent,
  QueryWarning,
  ServerInfo,
  SupportLevel,
} from "queryhost";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

/** Browser-safe game metadata serialized from QueryHost's package registry. */
export interface PlaygroundGameDefinition {
  readonly capabilities: Readonly<Record<GameCapability, SupportLevel>>;
  readonly defaultMode: QueryMode;
  readonly defaultPort?: number;
  readonly defaultQueryPort?: number;
  readonly queryPortStrategy?: "offset" | "fixed";
  readonly id: GameId;
  readonly name: string;
}

/** Non-secret fields accepted from the public playground. */
export interface PlaygroundQueryInput {
  readonly game: GameId;
  readonly host: string;
  readonly port?: number;
  readonly queryPort?: number;
  readonly mode?: QueryMode;
  readonly timeoutMs?: number;
}

/** The game picker's choice: a registry game, or `auto` to detect the game first. */
export type PlaygroundGameChoice = GameId | "auto";

/** Non-secret fields accepted by the playground's detection route. */
export interface PlaygroundDetectInput {
  readonly host: string;
  readonly port?: number;
  readonly mode?: QueryMode;
  readonly timeoutMs?: number;
}

export type HostedCacheStatus = "coalesced" | "hit" | "miss";

export interface HostedCacheMetadata {
  readonly status: HostedCacheStatus;
  readonly ageMs: number;
  readonly ttlMs: number;
}

interface HostedResultBase {
  readonly game: GameId;
  readonly durationMs: number;
  readonly sources: readonly QuerySource[];
  readonly warnings: readonly QueryWarning[];
  readonly cache: HostedCacheMetadata;
}

export interface PlaygroundQuerySuccess extends HostedResultBase {
  readonly ok: true;
  readonly server: ServerInfo;
  readonly data: JsonObject;
  readonly rawData?: JsonObject;
  readonly partial: boolean;
}

export interface PlaygroundQueryFailure extends HostedResultBase {
  readonly ok: false;
  readonly error: QueryError;
}

export type PlaygroundQueryResponse =
  PlaygroundQueryFailure | PlaygroundQuerySuccess;

/**
 * One line of a streamed query response: the library's source progress while the query runs,
 * then exactly one `result` line with the body a JSON response would carry.
 */
export type PlaygroundQueryStreamLine =
  | QuerySourceEvent
  | { readonly type: "result"; readonly result: PlaygroundQueryResponse };

export type PlaygroundProxyErrorCode =
  | "BAD_REQUEST"
  | "BODY_TOO_LARGE"
  | "METHOD_NOT_ALLOWED"
  | "NETWORK_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "UPSTREAM_INVALID"
  | "UPSTREAM_UNAVAILABLE";

export interface PlaygroundProxyErrorResponse {
  readonly error: {
    readonly code: PlaygroundProxyErrorCode;
    readonly message: string;
  };
}
