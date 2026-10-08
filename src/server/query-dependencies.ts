import {
  BadgeService,
  DEFAULT_BADGE_CACHE_POLICY,
  loadBadgeGatePolicy,
} from "./badge.js";
import { ProxyGate } from "./proxy-gate.js";
import {
  createDefaultPublicQueryDependencies,
  type PublicQueryDependencies,
} from "./public-query.js";

let dependencies: PublicQueryDependencies | undefined;
let apiDependencies: PublicQueryDependencies | undefined;
let badges: BadgeService | undefined;

/** Browser and MCP calls share one process-local admission gate. */
export function publicQueryDependencies(): PublicQueryDependencies {
  dependencies ??= createDefaultPublicQueryDependencies();
  return dependencies;
}

/**
 * Public API callers get a separate gate so third-party traffic cannot use up
 * the playground's budget.
 */
export function publicApiDependencies(): PublicQueryDependencies {
  apiDependencies ??= createDefaultPublicQueryDependencies(
    process.env,
    "QUERYHOST_WEB_PUBLIC_API_",
  );
  return apiDependencies;
}

/**
 * Badges reuse the public API's query target but have their own cache and a
 * global budget, so image traffic never spends a caller's API allowance.
 */
export function badgeService(): BadgeService {
  badges ??= new BadgeService({
    cache: DEFAULT_BADGE_CACHE_POLICY,
    gate: new ProxyGate(loadBadgeGatePolicy()),
    now: Date.now,
    query: publicApiDependencies(),
  });
  return badges;
}
