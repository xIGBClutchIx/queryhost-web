import type {
  HostedCacheStatus,
  PlaygroundProxyErrorCode,
} from "../lib/playground-contracts.js";

// The library owns its result vocabulary and exports every union as a frozen
// tuple, so the OpenAPI document and the MCP result schema follow each release
// without a copy here to update.
export {
  QUERY_ERROR_CODES,
  QUERY_SOURCE_NAMES,
  QUERY_SOURCE_STATUSES,
  QUERY_WARNING_CODES,
} from "queryhost/registry";

// These unions belong to this service. Keying each table by its union makes
// typecheck fail when a member is added or removed, so the schemas cannot drift.
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
