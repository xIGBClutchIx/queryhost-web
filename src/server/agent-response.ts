import { z } from "zod";
import type {
  PlaygroundProxyErrorResponse,
  PlaygroundQueryResponse,
} from "../lib/playground-contracts.js";
import {
  CACHE_STATUSES,
  PROXY_ERROR_CODES,
  QUERY_ERROR_CODES,
  QUERY_SOURCE_NAMES,
  QUERY_SOURCE_STATUSES,
  QUERY_WARNING_CODES,
  vocabulary,
} from "./result-vocabulary.js";

// Library enums come from the installed release's own vocabulary, so a release
// that adds a value is accepted instead of making valid results fail this
// schema as `UPSTREAM_INVALID`.
const sourceName = z.enum(QUERY_SOURCE_NAMES);
const source = z.object({
  source: sourceName,
  status: z.enum(QUERY_SOURCE_STATUSES),
  rttMs: z.number().nonnegative().optional(),
});
const warning = z.object({
  code: z.enum(QUERY_WARNING_CODES),
  message: z.string(),
  source: sourceName.optional(),
});
const base = z.object({
  game: z.string(),
  durationMs: z.number().nonnegative(),
  sources: z.array(source),
  warnings: z.array(warning),
  cache: z.object({
    status: z.enum(vocabulary(CACHE_STATUSES)),
    ageMs: z.number().nonnegative(),
    ttlMs: z.number().nonnegative(),
  }),
});
const queryResponse = z.discriminatedUnion("ok", [
  base.extend({
    ok: z.literal(true),
    partial: z.boolean(),
    server: z.object({
      name: z.string().optional(),
      map: z.string().optional(),
      version: z.string().optional(),
      password: z.boolean().optional(),
      players: z
        .object({
          online: z.number().nonnegative().optional(),
          max: z.number().nonnegative().optional(),
        })
        .optional(),
      queryRttMs: z.number().nonnegative().optional(),
    }),
    data: z.record(z.string(), z.json()),
    rawData: z.record(z.string(), z.json()).optional(),
  }),
  base.extend({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(QUERY_ERROR_CODES),
      message: z.string(),
      source: sourceName.optional(),
    }),
  }),
]);
const proxyResponse = z.object({
  error: z.object({
    code: z.enum(vocabulary(PROXY_ERROR_CODES)),
    message: z.string(),
  }),
});

/** Validates API data before exposing it through model-facing tools. */
export function parseAgentResponse(
  text: string,
  game: string,
): PlaygroundQueryResponse | PlaygroundProxyErrorResponse {
  const value = JSON.parse(text) as object;
  if ("ok" in value) {
    const result = queryResponse.parse(value);
    if (result.game !== game) throw new Error("Mismatched query game.");
    return result as PlaygroundQueryResponse;
  }
  return proxyResponse.parse(value);
}
