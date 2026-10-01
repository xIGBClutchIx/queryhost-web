import { z } from "zod";
import type {
  PlaygroundProxyErrorResponse,
  PlaygroundQueryResponse,
} from "../lib/playground-contracts.js";

const sourceName = z.enum([
  "a2s-info",
  "a2s-player",
  "a2s-rules",
  "minecraft-srv",
  "minecraft-slp",
  "minecraft-query",
  "minecraft-bedrock-raknet",
  "fivem-info",
  "fivem-dynamic",
  "fivem-players",
  "redm-info",
  "redm-dynamic",
  "redm-players",
  "satisfactory-lightweight",
  "satisfactory-health",
  "vintage-story-query",
]);
const source = z.object({
  source: sourceName,
  status: z.enum([
    "ok",
    "timeout",
    "blocked",
    "malformed",
    "unsupported",
    "not-requested",
    "failed",
  ]),
  rttMs: z.number().nonnegative().optional(),
});
const warning = z.object({
  code: z.enum([
    "PARTIAL_RESULT",
    "PLAYER_LIST_UNAVAILABLE",
    "SOURCE_BLOCKED",
    "SOURCE_FAILED",
    "SOURCE_MALFORMED",
    "SOURCE_TIMEOUT",
  ]),
  message: z.string(),
  source: sourceName.optional(),
});
const base = z.object({
  game: z.string(),
  durationMs: z.number().nonnegative(),
  sources: z.array(source),
  warnings: z.array(warning),
  cache: z.object({
    status: z.enum(["coalesced", "hit", "miss"]),
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
      code: z.enum([
        "ABORTED",
        "CONNECTION_FAILED",
        "DNS_FAILED",
        "INTERNAL_ERROR",
        "INVALID_INPUT",
        "MALFORMED_RESPONSE",
        "RESPONSE_TOO_LARGE",
        "TARGET_BLOCKED",
        "TIMEOUT",
      ]),
      message: z.string(),
      source: sourceName.optional(),
    }),
  }),
]);
const proxyResponse = z.object({
  error: z.object({
    code: z.enum([
      "BAD_REQUEST",
      "BODY_TOO_LARGE",
      "METHOD_NOT_ALLOWED",
      "NETWORK_ERROR",
      "RATE_LIMITED",
      "UPSTREAM_INVALID",
      "UPSTREAM_UNAVAILABLE",
    ]),
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
