import type { JsonObject, JsonValue } from "../lib/playground-contracts.js";

export const MCP_RESULT_BYTE_LIMIT = 16_384;
export const MCP_ARRAY_LIMIT = 20;
export const MCP_OBJECT_LIMIT = 32;
export const MCP_STRING_LIMIT = 512;
const encoder = new TextEncoder();

/** Remote projection only: the browser and private API retain their full results. */
export function compactMcpResult(output: JsonObject): JsonObject {
  const omissions = new Set<string>();
  let remaining = 6_144;
  let detailNodes = 0;
  function clip(text: string, limit = MCP_STRING_LIMIT): string {
    if (encoder.encode(text).byteLength <= limit) return text;
    let result = "";
    let bytes = 0;
    for (const character of text) {
      const size = encoder.encode(character).byteLength;
      if (bytes + size > limit - 3) break;
      result += character;
      bytes += size;
    }
    return `${result}…`;
  }
  function project(
    value: JsonValue,
    path: string,
    depth: number,
  ): JsonValue | undefined {
    if (path.startsWith("result.data") && ++detailNodes > 300) {
      omissions.add(path);
      return undefined;
    }
    if (typeof value === "string") {
      const result = clip(value);
      if (result !== value) omissions.add(path);
      return result;
    }
    if (value === null || typeof value !== "object") return value;
    if (depth >= 6) {
      omissions.add(path);
      return undefined;
    }
    if (Array.isArray(value)) {
      if (value.length > MCP_ARRAY_LIMIT) omissions.add(path);
      const items: JsonValue[] = [];
      for (const [index, item] of value.slice(0, MCP_ARRAY_LIMIT).entries()) {
        const projected = project(item, `${path}[${index}]`, depth + 1);
        if (projected === undefined) break;
        items.push(projected);
      }
      return items.length === 0 && value.length > 0 ? undefined : items;
    }
    const result: Record<string, JsonValue> = {};
    const entries = Object.entries(value);
    if (entries.length > MCP_OBJECT_LIMIT) omissions.add(path);
    for (const [key, item] of entries.slice(0, MCP_OBJECT_LIMIT)) {
      const nextPath = path === "" ? key : `${path}.${key}`;
      if (key === "favicon" || key === "rawData" || key === "html") {
        omissions.add(nextPath);
        continue;
      }
      // Bound serialized detail bytes, including JSON escaping and property names.
      const projected = project(item, nextPath, depth + 1);
      if (projected === undefined) continue;
      const cost = encoder.encode(
        JSON.stringify({ [key]: projected }),
      ).byteLength;
      if (path.startsWith("result.data") && cost > remaining) {
        omissions.add(nextPath);
        continue;
      }
      if (path.startsWith("result.data")) remaining -= cost;
      const projectedKey = clip(key, 128);
      if (projectedKey !== key) {
        omissions.add(nextPath);
        continue;
      }
      Object.defineProperty(result, projectedKey, {
        value: projected,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  }
  const projected = project(output, "", 0) as JsonObject;
  let result: JsonObject = {
    ...projected,
    projection: {
      truncated: omissions.size > 0,
      omittedFields: [...omissions].slice(0, 20).map((path) => clip(path, 128)),
      omittedFieldCount: omissions.size,
      limits: {
        arrayItems: MCP_ARRAY_LIMIT,
        objectFields: MCP_OBJECT_LIMIT,
        stringBytes: MCP_STRING_LIMIT,
        resultBytes: MCP_RESULT_BYTE_LIMIT,
      },
    },
  };
  if (
    encoder.encode(JSON.stringify(result)).byteLength > MCP_RESULT_BYTE_LIMIT
  ) {
    // Keep authoritative success/failure and population even with pathological details.
    const query = result["result"];
    if (query !== null && typeof query === "object" && !Array.isArray(query)) {
      result = {
        ...result,
        result: Object.fromEntries(
          Object.entries(query).filter(
            ([key]) => !["data", "sources", "warnings"].includes(key),
          ),
        ),
        projection: {
          ...(result["projection"] as JsonObject),
          truncated: true,
          omittedFields: ["result.data", "result.sources", "result.warnings"],
          omittedFieldCount: omissions.size + 3,
        },
      };
    }
  }
  if (encoder.encode(JSON.stringify(result)).byteLength > MCP_RESULT_BYTE_LIMIT)
    throw new RangeError("MCP result exceeds the byte limit.");
  return result;
}

/** Each comparison member receives its own budget; discovery metadata is untouched. */
export function compactMcpOutput(output: JsonObject): JsonObject {
  const results = output["results"];
  if (Array.isArray(results))
    return {
      results: results.map((result) => {
        if (
          result === null ||
          typeof result !== "object" ||
          Array.isArray(result)
        )
          throw new Error("Invalid comparison result.");
        return compactMcpResult(result);
      }),
    };
  return "result" in output ? compactMcpResult(output) : output;
}
