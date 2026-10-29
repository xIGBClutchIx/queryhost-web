import type {
  QueryErrorCode,
  QuerySourceName,
  QuerySourceStatus,
  QueryWarningCode,
} from "queryhost";

import type {
  HostedCacheStatus,
  PlaygroundProxyErrorCode,
} from "../lib/playground-contracts.js";

// The library exports these unions only as types. Keying each table by its
// union makes typecheck fail when a library release adds or removes a member,
// so neither the OpenAPI document nor the MCP result schema can drift from the
// package they describe.
export const QUERY_ERROR_CODES: Readonly<Record<QueryErrorCode, true>> = {
  ABORTED: true,
  CONNECTION_FAILED: true,
  DNS_FAILED: true,
  INTERNAL_ERROR: true,
  INVALID_INPUT: true,
  MALFORMED_RESPONSE: true,
  RESPONSE_TOO_LARGE: true,
  TARGET_BLOCKED: true,
  TIMEOUT: true,
};
export const QUERY_WARNING_CODES: Readonly<Record<QueryWarningCode, true>> = {
  PARTIAL_RESULT: true,
  PLAYER_LIST_UNAVAILABLE: true,
  SOURCE_BLOCKED: true,
  SOURCE_FAILED: true,
  SOURCE_MALFORMED: true,
  SOURCE_TIMEOUT: true,
};
export const QUERY_SOURCE_NAMES: Readonly<Record<QuerySourceName, true>> = {
  "a2s-info": true,
  "a2s-player": true,
  "a2s-rules": true,
  "eco-frontpage": true,
  "minecraft-srv": true,
  "minecraft-slp": true,
  "minecraft-legacy-ping": true,
  "minecraft-query": true,
  "minecraft-bedrock-raknet": true,
  "minecraft-bedrock-nethernet": true,
  "fivem-info": true,
  "fivem-dynamic": true,
  "fivem-players": true,
  "redm-info": true,
  "redm-dynamic": true,
  "redm-players": true,
  "satisfactory-lightweight": true,
  "satisfactory-health": true,
  "vintage-story-query": true,
  "project-reclaimer-status": true,
};
export const QUERY_SOURCE_STATUSES: Readonly<Record<QuerySourceStatus, true>> =
  {
    ok: true,
    timeout: true,
    blocked: true,
    malformed: true,
    unsupported: true,
    "not-requested": true,
    failed: true,
  };
export const CACHE_STATUSES: Readonly<Record<HostedCacheStatus, true>> = {
  coalesced: true,
  hit: true,
  miss: true,
};
/** Every `{ error: { code } }` the web service or the query service may answer with. */
export const PROXY_ERROR_CODES: Readonly<
  Record<PlaygroundProxyErrorCode, true>
> = {
  BAD_REQUEST: true,
  BODY_TOO_LARGE: true,
  METHOD_NOT_ALLOWED: true,
  NETWORK_ERROR: true,
  NOT_FOUND: true,
  OVERLOADED: true,
  RATE_LIMITED: true,
  UNAUTHORIZED: true,
  UNEXPECTED_RESPONSE: true,
  UPSTREAM_INVALID: true,
  UPSTREAM_UNAVAILABLE: true,
};

/** A table's members as a non-empty tuple, as `z.enum` requires. */
export function vocabulary<Member extends string>(
  table: Readonly<Record<Member, true>>,
): [Member, ...Member[]] {
  return Object.keys(table) as [Member, ...Member[]];
}
