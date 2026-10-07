import {
  createDefaultPublicQueryDependencies,
  type PublicQueryDependencies,
} from "./public-query.js";

let dependencies: PublicQueryDependencies | undefined;
let apiDependencies: PublicQueryDependencies | undefined;

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
