import html from "../generated/queryhost-app.html?raw";
import { WORKSPACE_URI } from "../lib/mcp-workspace-contract.js";
import type { JsonObject, JsonValue } from "../lib/playground-contracts.js";
import {
  FULL_RESULT_KEY,
  FULL_RESULT_LIMIT,
} from "../lib/mcp-workspace-contract.js";

export { WORKSPACE_URI };
export const workspaceHtml = html;

/** UI-only details never enlarge the model-facing projection or load binary assets. */
export function workspaceMetadata(output: JsonObject): JsonObject {
  let limited = false;
  const clean = (value: JsonValue, depth: number): JsonValue => {
    if (depth > 32) {
      limited = true;
      return "Details omitted: nesting limit.";
    }
    if (Array.isArray(value))
      return value.map((item) => clean(item, depth + 1));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => key !== "favicon")
          .map(([key, item]) => [key, clean(item, depth + 1)]),
      );
    }
    return value;
  };
  const details = clean(output, 0);
  const metadata = {
    [FULL_RESULT_KEY]: details,
    "queryhost/detailLimited": limited,
  };
  if (Buffer.byteLength(JSON.stringify(metadata), "utf8") > FULL_RESULT_LIMIT)
    return { "queryhost/detailLimited": true };
  return metadata;
}
