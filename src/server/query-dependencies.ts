import {
  createDefaultPublicQueryDependencies,
  type PublicQueryDependencies,
} from "./public-query.js";

let dependencies: PublicQueryDependencies | undefined;

/** Browser and MCP calls share one process-local admission gate. */
export function publicQueryDependencies(): PublicQueryDependencies {
  dependencies ??= createDefaultPublicQueryDependencies();
  return dependencies;
}
