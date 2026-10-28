import { publicApiGamesUsage } from "./public-api.js";
import {
  BadgeService,
  DEFAULT_BADGE_CACHE_POLICY,
  loadBadgeGatePolicy,
} from "./badge.js";
import { PLAYGROUND_GAMES } from "../lib/playground-games.js";
import {
  loadPreviewGatePolicy,
  PreviewService,
  rasterizePreview,
} from "./preview.js";
import { ProxyGate } from "./proxy-gate.js";
import { localDetect, type PublicDetectDependencies } from "./public-detect.js";
import {
  createDefaultPublicQueryDependencies,
  MCP_QUERY_GATE_DEFAULTS,
  type PublicQueryDependencies,
} from "./public-query.js";
import {
  loadUsageReportToken,
  type UsageReportDependencies,
} from "./usage-report.js";

const startedAt = Date.now();

let dependencies: PublicQueryDependencies | undefined;
let detectDependencies: PublicDetectDependencies | undefined;
let apiDependencies: PublicQueryDependencies | undefined;
let mcpDependencies: PublicQueryDependencies | undefined;
let badges: BadgeService | undefined;
let previews: PreviewService | undefined;

/** Same-origin playground calls share one process-local admission gate. */
export function publicQueryDependencies(): PublicQueryDependencies {
  dependencies ??= createDefaultPublicQueryDependencies();
  return dependencies;
}

/** Playground detections spend the same per-caller budget as its queries. */
export function publicDetectDependencies(): PublicDetectDependencies {
  detectDependencies ??= {
    ...publicQueryDependencies(),
    detectRunner: localDetect,
  };
  return detectDependencies;
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
 * MCP tool queries get their own gate. Hosted clients such as ChatGPT share a
 * few egress addresses, so under the playground's per-IP budget every one of
 * their users would share a single caller's allowance.
 */
export function mcpQueryDependencies(): PublicQueryDependencies {
  mcpDependencies ??= createDefaultPublicQueryDependencies(
    process.env,
    "QUERYHOST_WEB_MCP_",
    MCP_QUERY_GATE_DEFAULTS,
  );
  return mcpDependencies;
}

let reportDependencies: UsageReportDependencies | undefined;

/** Operator usage report over the query surfaces and the games route. */
export function usageReportDependencies(): UsageReportDependencies {
  reportDependencies ??= {
    token: loadUsageReportToken(),
    startedAt,
    playground: publicQueryDependencies(),
    publicApi: publicApiDependencies(),
    mcp: mcpQueryDependencies(),
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

/**
 * Result previews read badge state, so a link preview never spends more of the
 * query budget than the server's badge would, and drawing has its own budget.
 */
export function previewService(): PreviewService {
  previews ??= new PreviewService({
    badges: badgeService(),
    games: PLAYGROUND_GAMES,
    gate: new ProxyGate(loadPreviewGatePolicy()),
    maxEntries: 256,
    now: Date.now,
    rasterize: rasterizePreview,
  });
  return previews;
}
