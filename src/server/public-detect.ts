import { detect, type DetectResult } from "queryhost";

import type {
  JsonObject,
  PlaygroundDetectInput,
} from "../lib/playground-contracts.js";
import { readBoundedText } from "./bounded-text.js";
import {
  callerFingerprint,
  jsonObject,
  jsonResponse,
  normalizedHost,
  optionalInteger,
  parseJson,
  PublicQueryInputError,
  queryMode,
  readJsonRequest,
  type PublicQueryDependencies,
} from "./public-query.js";

const ALLOWED_FIELDS: ReadonlySet<string> = new Set([
  "host",
  "mode",
  "port",
  "timeoutMs",
]);
const ORIGIN_TOKEN_HEADER = "x-queryhost-origin-token";

/**
 * Probes one local detection may send. The hosted API applies its own
 * configured budget, which has the same default.
 */
export const LOCAL_DETECT_MAX_PROBES = 4;

/**
 * Starts one detection spends from the caller's budget, so trying several
 * protocols costs more than a single query without locking a visitor out.
 */
export const DETECT_COST = 4;

export interface LocalDetectInput extends PlaygroundDetectInput {
  readonly signal: AbortSignal;
}

export type LocalDetectRunner = (
  input: LocalDetectInput,
) => Promise<DetectResult>;

/** The playground's query dependencies plus the local detection runner. */
export interface PublicDetectDependencies extends PublicQueryDependencies {
  readonly detectRunner: LocalDetectRunner;
}

export function localDetect(input: LocalDetectInput): Promise<DetectResult> {
  return detect({ ...input, maxProbes: LOCAL_DETECT_MAX_PROBES });
}

/** Validates detection fields into the input the detection route forwards. */
export function parseDetectFields(body: JsonObject): PlaygroundDetectInput {
  const extraField = Object.keys(body).find((key) => !ALLOWED_FIELDS.has(key));
  if (extraField !== undefined) {
    throw new PublicQueryInputError(
      `Unsupported request field: ${extraField}.`,
    );
  }
  const port = optionalInteger(body["port"], "port", 1, 65_535);
  const mode = queryMode(body["mode"]);
  const timeoutMs = optionalInteger(body["timeoutMs"], "timeoutMs", 1, 5_000);
  return {
    host: normalizedHost(body["host"]),
    ...(port === undefined ? {} : { port }),
    ...(mode === undefined ? {} : { mode }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  };
}

function detectionResponse(body: string, status = 200): Response {
  return new Response(body, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

async function forwardDetect(
  input: PlaygroundDetectInput,
  dependencies: PublicDetectDependencies,
  callerSignal: AbortSignal,
): Promise<Response> {
  const usage = dependencies.usage;
  try {
    const signal = AbortSignal.any([
      callerSignal,
      AbortSignal.timeout(dependencies.config.upstreamTimeoutMs),
    ]);
    if (dependencies.config.target.kind === "local") {
      const result = await dependencies.detectRunner({ ...input, signal });
      usage.recordForwarded(200, null);
      return detectionResponse(JSON.stringify(result));
    }

    const target = dependencies.config.target;
    const upstream = await dependencies.fetcher(`${target.apiBaseUrl}/detect`, {
      body: JSON.stringify(input),
      headers: {
        "Content-Type": "application/json",
        [ORIGIN_TOKEN_HEADER]: target.apiOriginToken,
      },
      method: "POST",
      redirect: "error",
      signal,
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.startsWith("application/json")) {
      usage.recordUnavailable();
      return jsonResponse(
        502,
        "UPSTREAM_INVALID",
        "The query service returned an invalid response.",
      );
    }
    const body = await readBoundedText(upstream.body, 2_097_152, signal);
    usage.recordForwarded(upstream.status, null);
    const response = detectionResponse(body, upstream.status);
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter !== null) {
      response.headers.set("Retry-After", retryAfter);
    }
    return response;
  } catch {
    usage.recordUnavailable();
    return jsonResponse(
      502,
      "UPSTREAM_UNAVAILABLE",
      "The query service is temporarily unavailable.",
    );
  }
}

/**
 * Validates, admits, and forwards one playground detection. It shares the
 * playground's gate and counters, charged {@link DETECT_COST} starts.
 */
export async function handlePublicDetect(
  request: Request,
  dependencies: PublicDetectDependencies,
): Promise<Response> {
  const usage = dependencies.usage;
  const text = await readJsonRequest(
    request,
    dependencies.config.maxBodyBytes,
    usage,
    "detections",
  );
  if (typeof text !== "string") {
    return text;
  }

  let input: PlaygroundDetectInput;
  try {
    input = parseDetectFields(jsonObject(parseJson(text)));
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      usage.recordInvalid();
      return jsonResponse(400, "BAD_REQUEST", error.message);
    }
    throw error;
  }

  const admission = dependencies.gate.admit(
    callerFingerprint(request),
    Date.now(),
    DETECT_COST,
  );
  if (!admission.accepted) {
    usage.recordRateLimited(admission.reason);
    return jsonResponse(
      429,
      "RATE_LIMITED",
      "Too many queries. Wait before trying again.",
      admission.retryAfterSeconds,
    );
  }

  try {
    return await forwardDetect(input, dependencies, request.signal);
  } finally {
    admission.release();
  }
}
