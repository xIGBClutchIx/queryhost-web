import type {
  QueryErrorCode,
  QuerySourceName,
  QuerySourceStatus,
  QueryWarningCode,
} from "queryhost";
import {
  GAME_ALIASES,
  GAME_IDS,
  type GameCapability,
  type SupportLevel,
} from "queryhost/registry";

import type {
  HostedCacheStatus,
  JsonObject,
} from "../lib/playground-contracts.js";
import { QUERYHOST_VERSION } from "../lib/package-version.js";
import { canonicalUrl, documentationHref } from "../lib/site.js";

/** Error codes the public API's `{ error: { code, message } }` bodies use. */
export type PublicApiErrorCode =
  | "BAD_REQUEST"
  | "BODY_TOO_LARGE"
  | "METHOD_NOT_ALLOWED"
  | "NOT_FOUND"
  | "OVERLOADED"
  | "RATE_LIMITED"
  | "UPSTREAM_INVALID"
  | "UPSTREAM_UNAVAILABLE";

// The library exports these unions only as types. Keying each table by its
// union makes typecheck fail when a library release adds or removes a member,
// so the spec cannot drift from the package it documents.
const PUBLIC_API_ERROR_CODES: Readonly<Record<PublicApiErrorCode, true>> = {
  BAD_REQUEST: true,
  BODY_TOO_LARGE: true,
  METHOD_NOT_ALLOWED: true,
  NOT_FOUND: true,
  RATE_LIMITED: true,
  OVERLOADED: true,
  UPSTREAM_INVALID: true,
  UPSTREAM_UNAVAILABLE: true,
};
const QUERY_ERROR_CODES: Readonly<Record<QueryErrorCode, true>> = {
  ABORTED: true,
  CONNECTION_FAILED: true,
  DNS_FAILED: true,
  INTERNAL_ERROR: true,
  INVALID_INPUT: true,
  MALFORMED_RESPONSE: true,
  RESPONSE_TOO_LARGE: true,
  TARGET_BLOCKED: true,
  TIMEOUT: true,
};
const QUERY_WARNING_CODES: Readonly<Record<QueryWarningCode, true>> = {
  PARTIAL_RESULT: true,
  PLAYER_LIST_UNAVAILABLE: true,
  SOURCE_BLOCKED: true,
  SOURCE_FAILED: true,
  SOURCE_MALFORMED: true,
  SOURCE_TIMEOUT: true,
};
const QUERY_SOURCE_NAMES: Readonly<Record<QuerySourceName, true>> = {
  "a2s-info": true,
  "a2s-player": true,
  "a2s-rules": true,
  "minecraft-srv": true,
  "minecraft-slp": true,
  "minecraft-query": true,
  "minecraft-bedrock-raknet": true,
  "fivem-info": true,
  "fivem-dynamic": true,
  "fivem-players": true,
  "redm-info": true,
  "redm-dynamic": true,
  "redm-players": true,
  "satisfactory-lightweight": true,
  "satisfactory-health": true,
  "vintage-story-query": true,
};
const QUERY_SOURCE_STATUSES: Readonly<Record<QuerySourceStatus, true>> = {
  ok: true,
  timeout: true,
  blocked: true,
  malformed: true,
  unsupported: true,
  "not-requested": true,
  failed: true,
};
const GAME_CAPABILITIES: Readonly<Record<GameCapability, true>> = {
  summary: true,
  players: true,
  rules: true,
  mods: true,
  plugins: true,
  resources: true,
  srv: true,
};
const SUPPORT_LEVELS: Readonly<Record<SupportLevel, true>> = {
  supported: true,
  conditional: true,
  unsupported: true,
};
const CACHE_STATUSES: Readonly<Record<HostedCacheStatus, true>> = {
  coalesced: true,
  hit: true,
  miss: true,
};

/** Error codes listed in the spec, in documentation order. */
export const OPENAPI_ERROR_CODES: readonly PublicApiErrorCode[] = Object.keys(
  PUBLIC_API_ERROR_CODES,
) as PublicApiErrorCode[];
/** Library failure codes listed in the spec. */
export const OPENAPI_QUERY_ERROR_CODES: readonly QueryErrorCode[] = Object.keys(
  QUERY_ERROR_CODES,
) as QueryErrorCode[];

const ref = (name: string): JsonObject => ({
  $ref: `#/components/schemas/${name}`,
});

/**
 * A string whose current values are listed but which may gain new ones, as
 * `v1` promises for games and codes. Generated clients then accept values
 * added after they were built instead of rejecting the response.
 */
function openEnum(values: readonly string[], description: string): JsonObject {
  return {
    anyOf: [{ enum: [...values], type: "string" }, { type: "string" }],
    description,
  };
}

const integer = (minimum: number, maximum?: number): JsonObject => ({
  minimum,
  type: "integer",
  ...(maximum === undefined ? {} : { maximum }),
});

const port = (description: string): JsonObject => ({
  ...integer(1, 65_535),
  description,
});

const jsonContent = (schema: JsonObject): JsonObject => ({
  "application/json": { schema },
});

const errorResponse = (description: string, extra: JsonObject = {}) => ({
  content: jsonContent(ref("ApiError")),
  description,
  ...extra,
});

const RETRY_AFTER: JsonObject = {
  "Retry-After": {
    description: "Seconds to wait before retrying.",
    schema: integer(0),
  },
};

const CORS_ORIGIN: JsonObject = {
  "Access-Control-Allow-Origin": {
    description: "Always `*`; the API never uses credentials.",
    schema: { const: "*", type: "string" },
  },
};

function buildSchemas(): JsonObject {
  const capabilities = Object.keys(GAME_CAPABILITIES);
  return {
    ApiError: {
      additionalProperties: false,
      properties: {
        error: {
          additionalProperties: false,
          properties: {
            code: openEnum(
              OPENAPI_ERROR_CODES,
              "Stable request-failure code. Treat unknown codes as a generic failure.",
            ),
            message: { description: "Human-readable detail.", type: "string" },
          },
          required: ["code", "message"],
          type: "object",
        },
      },
      required: ["error"],
      type: "object",
    },
    GameCapabilities: {
      additionalProperties: ref("SupportLevel"),
      properties: Object.fromEntries(
        capabilities.map((capability) => [capability, ref("SupportLevel")]),
      ),
      required: capabilities,
      type: "object",
    },
    GameDefinition: {
      properties: {
        capabilities: ref("GameCapabilities"),
        defaultPort: port(
          "Default game or service port; omitted when the profile cannot infer one.",
        ),
        defaultQueryPort: port(
          "Conventional query port when the protocol uses a separate destination.",
        ),
        id: ref("GameId"),
        name: { type: "string" },
        queryPortStrategy: {
          description:
            "Whether a custom game port shifts the query port (`offset`) or leaves it fixed.",
          enum: ["offset", "fixed"],
          type: "string",
        },
      },
      required: ["id", "name", "capabilities"],
      type: "object",
    },
    GameId: openEnum(GAME_IDS, "Canonical game ID."),
    GameInput: {
      description:
        "A supported game ID or alias. Results always report the canonical ID.",
      enum: [...GAME_IDS, ...Object.keys(GAME_ALIASES)],
      type: "string",
    },
    GamesResponse: {
      properties: {
        games: { items: ref("GameDefinition"), type: "array" },
      },
      required: ["games"],
      type: "object",
    },
    HostedCache: {
      properties: {
        ageMs: { ...integer(0), description: "Age of the reused result." },
        status: {
          description:
            "`miss` ran live, `coalesced` shared an identical in-flight query, `hit` reused a cached result.",
          enum: Object.keys(CACHE_STATUSES),
          type: "string",
        },
        ttlMs: { ...integer(0), description: "How long the result is reused." },
      },
      required: ["status", "ageMs", "ttlMs"],
      type: "object",
    },
    QueryError: {
      properties: {
        code: openEnum(
          OPENAPI_QUERY_ERROR_CODES,
          "Stable library failure code.",
        ),
        message: { type: "string" },
        source: ref("QuerySourceName"),
      },
      required: ["code", "message"],
      type: "object",
    },
    QueryFailure: {
      properties: {
        ...resultBaseProperties(),
        error: ref("QueryError"),
        ok: { const: false, type: "boolean" },
      },
      required: [...RESULT_BASE_REQUIRED, "ok", "error"],
      type: "object",
    },
    QueryRequest: {
      additionalProperties: false,
      properties: {
        game: ref("GameInput"),
        host: {
          description: "A public hostname or IP address, not a URL.",
          maxLength: 253,
          minLength: 1,
          type: "string",
        },
        mode: {
          default: "full",
          description: "`summary` runs only the primary query.",
          enum: ["summary", "full"],
          type: "string",
        },
        port: port("Game port. Required for generic `a2s`."),
        queryPort: port(
          "Overrides the profile's query port. Not accepted for generic `a2s`.",
        ),
        timeoutMs: { ...integer(1, 5_000), default: 5_000 },
      },
      required: ["game", "host"],
      type: "object",
    },
    QueryResult: {
      description:
        "The library's query result. Branch on `ok`: an offline server is a `200` with `ok: false`.",
      oneOf: [ref("QuerySuccess"), ref("QueryFailure")],
    },
    QuerySource: {
      properties: {
        rttMs: {
          description: "Exchange time, when an exchange completed.",
          minimum: 0,
          type: "number",
        },
        source: ref("QuerySourceName"),
        status: openEnum(
          Object.keys(QUERY_SOURCE_STATUSES),
          "Outcome of this source.",
        ),
      },
      required: ["source", "status"],
      type: "object",
    },
    QuerySourceName: openEnum(
      Object.keys(QUERY_SOURCE_NAMES),
      "Protocol or discovery source.",
    ),
    QuerySuccess: {
      properties: {
        ...resultBaseProperties(),
        data: {
          additionalProperties: true,
          description:
            "Game-specific data; its shape depends on `game`. See the library's API reference.",
          type: "object",
        },
        ok: { const: true, type: "boolean" },
        partial: {
          description: "True when optional enrichment remained incomplete.",
          type: "boolean",
        },
        rawData: {
          additionalProperties: true,
          description:
            "Untouched protocol fields, for games that report them in `full` mode.",
          type: "object",
        },
        server: ref("ServerInfo"),
      },
      required: [...RESULT_BASE_REQUIRED, "ok", "server", "data", "partial"],
      type: "object",
    },
    QueryWarning: {
      properties: {
        code: openEnum(
          Object.keys(QUERY_WARNING_CODES),
          "Non-fatal condition code.",
        ),
        message: { type: "string" },
        source: ref("QuerySourceName"),
      },
      required: ["code", "message"],
      type: "object",
    },
    ServerInfo: {
      description:
        "Common server fields. A field is omitted when no source confirmed it; it is never filled with a placeholder zero, `false`, or empty value.",
      properties: {
        map: { type: "string" },
        name: { type: "string" },
        password: { type: "boolean" },
        players: {
          properties: { max: integer(0), online: integer(0) },
          type: "object",
        },
        queryRttMs: {
          description: "Round-trip time of the primary query, not ICMP.",
          minimum: 0,
          type: "number",
        },
        version: { type: "string" },
      },
      type: "object",
    },
    SupportLevel: openEnum(
      Object.keys(SUPPORT_LEVELS),
      "Whether a capability is guaranteed, source-dependent, or unavailable.",
    ),
  };
}

const RESULT_BASE_REQUIRED: readonly string[] = [
  "game",
  "durationMs",
  "sources",
  "warnings",
  "cache",
];

function resultBaseProperties(): JsonObject {
  return {
    cache: ref("HostedCache"),
    durationMs: { minimum: 0, type: "number" },
    game: ref("GameId"),
    sources: { items: ref("QuerySource"), type: "array" },
    warnings: { items: ref("QueryWarning"), type: "array" },
  };
}

function buildPaths(): JsonObject {
  const notAllowed = errorResponse("The route does not allow this method.");
  return {
    "/badge/{game}/{server}.svg": {
      get: {
        description:
          "Returns an SVG badge with the game name and player count, or `offline`. Badges are cached and share one global budget instead of the per-IP query limit; when it is spent the badge shows its last known state or `unavailable`.",
        operationId: "getBadge",
        parameters: [
          {
            in: "path",
            name: "game",
            required: true,
            schema: ref("GameInput"),
          },
          {
            description:
              "`host`, `host:port`, or a bracketed IPv6 address with an optional port, as in `[2001:db8::1]:27015`.",
            in: "path",
            name: "server",
            required: true,
            schema: { type: "string" },
          },
          {
            description: "Overrides the profile's query port.",
            in: "query",
            name: "queryPort",
            required: false,
            schema: port("Query port."),
          },
        ],
        responses: {
          "200": {
            content: { "image/svg+xml": { schema: { type: "string" } } },
            description: "The badge.",
            headers: CORS_ORIGIN,
          },
          "400": {
            content: { "image/svg+xml": { schema: { type: "string" } } },
            description: "An `invalid` badge for a malformed server or game.",
          },
          "404": errorResponse("The path does not end in `.svg`."),
          "405": notAllowed,
        },
        summary: "Server status badge",
        tags: ["Badges"],
      },
    },
    "/games": {
      get: {
        description:
          "Lists every supported game straight from the library's registry. Responses may be reused for 5 minutes; send the `ETag` back in `If-None-Match` to get an empty `304` when the list is unchanged.",
        operationId: "listGames",
        parameters: [
          {
            in: "header",
            name: "If-None-Match",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": {
            content: jsonContent(ref("GamesResponse")),
            description: "Supported games.",
            headers: {
              ...CORS_ORIGIN,
              ETag: { schema: { type: "string" } },
            },
          },
          "304": { description: "The list is unchanged." },
          "405": notAllowed,
        },
        summary: "List games",
        tags: ["Games"],
      },
    },
    "/openapi.json": {
      get: {
        operationId: "getOpenApi",
        responses: {
          "200": {
            content: jsonContent({ type: "object" }),
            description: "This document.",
          },
          "304": { description: "The document is unchanged." },
          "405": notAllowed,
        },
        summary: "OpenAPI document",
        tags: ["Meta"],
      },
    },
    "/query": {
      post: {
        description:
          "Runs one live query through the hosted cache. A query that reaches the query service returns `200` with the library result, even when the server is offline; check `ok`.",
        operationId: "queryServer",
        requestBody: {
          content: jsonContent(ref("QueryRequest")),
          required: true,
        },
        responses: {
          "200": {
            content: jsonContent(ref("QueryResult")),
            description: "The query result.",
            headers: {
              ...CORS_ORIGIN,
              Age: {
                description: "Seconds since a reused result was produced.",
                schema: integer(0),
              },
              "x-queryhost-cache": {
                description: "Same as `cache.status`.",
                schema: { enum: Object.keys(CACHE_STATUSES), type: "string" },
              },
            },
          },
          "400": errorResponse("Invalid JSON or fields (`BAD_REQUEST`)."),
          "405": notAllowed,
          "413": errorResponse("The body exceeds 2 KiB (`BODY_TOO_LARGE`)."),
          "415": errorResponse(
            "The body is not `application/json` (`BAD_REQUEST`).",
          ),
          "429": errorResponse(
            "Your IP or the API budget is spent (`RATE_LIMITED`), or the query service is at capacity (`OVERLOADED`).",
            { headers: RETRY_AFTER },
          ),
          "502": errorResponse(
            "The query service is unreachable or answered badly (`UPSTREAM_UNAVAILABLE`, `UPSTREAM_INVALID`).",
          ),
        },
        summary: "Query a server",
        tags: ["Query"],
      },
    },
  };
}

/** Builds the OpenAPI 3.1 document for `https://query.host/api/v1`. */
export function buildOpenApiDocument(): JsonObject {
  return {
    components: { schemas: buildSchemas() },
    externalDocs: {
      description: "Public API guide",
      url: canonicalUrl(documentationHref("/public-api/")),
    },
    info: {
      description: `Query game servers over HTTPS without installing the library. No API key; any origin may call it. Game data comes from queryhost ${QUERYHOST_VERSION}.`,
      license: {
        identifier: "Apache-2.0",
        name: "Apache 2.0",
      },
      title: "QueryHost Public API",
      version: `1.0.0+queryhost.${QUERYHOST_VERSION}`,
    },
    openapi: "3.1.0",
    paths: buildPaths(),
    // No route takes credentials; callers are limited by IP address instead.
    security: [],
    servers: [{ url: canonicalUrl("/api/v1") }],
    tags: [
      { description: "Live server queries.", name: "Query" },
      { description: "Supported games from the registry.", name: "Games" },
      { description: "Embeddable SVG status badges.", name: "Badges" },
      { description: "This description.", name: "Meta" },
    ],
  };
}
