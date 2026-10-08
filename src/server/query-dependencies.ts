import { publicApiGamesUsage } from "./public-api.js";
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
import {
  loadUsageReportToken,
  type UsageReportDependencies,
} from "./usage-report.js";

const startedAt = Date.now();

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

let reportDependencies: UsageReportDependencies | undefined;

/** Operator usage report over both query surfaces and the games route. */
export function usageReportDependencies(): UsageReportDependencies {
  reportDependencies ??= {
    token: loadUsageReportToken(),
    startedAt,
    playground: publicQueryDependencies(),
    publicApi: publicApiDependencies(),
    games: publicApiGamesUsage,
  };
  return reportDependencies;
}

/**
 * Badges reuse the public API's query target but have their own cache and a
 * global budget, so image traffic never spends a caller's API allowance.
 */
export function badgeService(): BadgeService {
  const api = publicApiDependencies();
  badges ??= new BadgeService({
    cache: DEFAULT_BADGE_CACHE_POLICY,
    gate: new ProxyGate(loadBadgeGatePolicy()),
    now: Date.now,
    // Badge queries are not public API calls, so they leave its usage alone.
    query: {
      config: api.config,
      fetcher: api.fetcher,
      queryRunner: api.queryRunner,
    },
  });
  return badges;
}
