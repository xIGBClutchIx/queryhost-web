import type {
  GameCapability,
  GameId,
  QueryError,
  QueryMode,
  QuerySource,
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
  readonly defaultPort: number;
  readonly defaultQueryPort?: number;
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

export type PlaygroundProxyErrorCode =
  | "BAD_REQUEST"
  | "BODY_TOO_LARGE"
  | "METHOD_NOT_ALLOWED"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "UPSTREAM_INVALID"
  | "UPSTREAM_UNAVAILABLE";

export interface PlaygroundProxyErrorResponse {
  readonly error: {
    readonly code: PlaygroundProxyErrorCode;
    readonly message: string;
  };
}
