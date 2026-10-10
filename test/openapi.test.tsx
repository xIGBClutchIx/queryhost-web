import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { GAME_ALIASES, GAME_IDS } from "queryhost/registry";
import { describe, expect, it } from "vitest";

import type { JsonValue } from "../src/lib/playground-contracts.js";
import { GAMES } from "../src/lib/queryhost.js";
import {
  buildOpenApiDocument,
  OPENAPI_ERROR_CODES,
  OPENAPI_QUERY_ERROR_CODES,
} from "../src/server/openapi.js";
import {
  handlePublicApiNotFound,
  handlePublicApiOpenApi,
} from "../src/server/public-api.js";
import { PublicApiPage } from "../src/views/docs/PublicApiPage.js";

const API_URL = "https://query.host/api/v1";
const document = buildOpenApiDocument();

/** Walks object keys and array indexes, failing the test when a step is missing. */
function at(value: JsonValue, ...path: readonly string[]): JsonValue {
  let current = value;
  for (const key of path) {
    if (typeof current !== "object" || current === null) {
      throw new Error(`Expected an object or array before ${key}.`);
    }
    const next = Array.isArray(current) ? current[Number(key)] : current[key];
    if (next === undefined) {
      throw new Error(`Missing ${path.join(".")}.`);
    }
    current = next;
  }
  return current;
}

function keys(value: JsonValue): readonly string[] {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.keys(value)
    : [];
}

function schema(name: string): JsonValue {
  return at(document, "components", "schemas", name);
}

/** The listed values of an `openEnum` schema. */
function openEnumValues(value: JsonValue): JsonValue {
  return at(value, "anyOf", "0", "enum");
}

function refs(value: JsonValue): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(refs);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    key === "$ref" && typeof child === "string" ? [child] : refs(child),
  );
}

/** `/api/v1` routes implemented as Astro pages, in OpenAPI path syntax. */
function implementedRoutes(): readonly string[] {
  const root = join(import.meta.dirname, "../src/pages/api/v1");
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.name.startsWith("[..."))
    .map((entry) =>
      relative(root, join(entry.parentPath, entry.name))
        .split(sep)
        .join("/")
        .replace(/\.ts$/u, "")
        // The badge file segment is `{host}[:port].svg`, named `server` in the spec.
        .replace("[file]", "{server}.svg")
        .replace(/\[(\w+)\]/gu, "{$1}"),
    )
    .map((route) => `/${route}`)
    .sort();
}

describe("OpenAPI document", () => {
  it("documents exactly the implemented /api/v1 routes", () => {
    expect([...keys(at(document, "paths"))].sort()).toEqual(
      implementedRoutes(),
    );
    expect(at(document, "servers", "0", "url")).toBe(API_URL);
    expect(at(document, "openapi")).toBe("3.1.0");
  });

  it("resolves every schema reference", () => {
    const schemas = keys(at(document, "components", "schemas"));
    const unresolved = refs(document).filter(
      (target) =>
        !schemas.includes(target.replace("#/components/schemas/", "")),
    );
    expect(unresolved).toEqual([]);
  });

  it("takes game IDs and aliases from the packaged registry", () => {
    expect(at(schema("GameInput"), "enum")).toEqual([
      ...GAME_IDS,
      ...Object.keys(GAME_ALIASES),
    ]);
    expect(openEnumValues(schema("GameId"))).toEqual([...GAME_IDS]);
    const rust = GAMES.find((game) => game.id === "rust");
    expect(at(schema("GameCapabilities"), "required")).toEqual(
      Object.keys(rust?.capabilities ?? {}),
    );
  });

  it("describes every field the games route serves", () => {
    const properties = keys(at(schema("GameDefinition"), "properties"));
    const served = new Set(GAMES.flatMap((game) => Object.keys(game)));
    expect([...served].filter((key) => !properties.includes(key))).toEqual([]);
    const protocols = new Set(GAMES.map((game) => game.protocol));
    const documented = openEnumValues(
      at(schema("GameDefinition"), "properties", "protocol"),
    );
    expect(documented).toEqual(expect.arrayContaining([...protocols]));
    expect(documented).toHaveLength(protocols.size);
  });

  it("lists the library's failure codes", () => {
    expect(
      openEnumValues(at(schema("QueryError"), "properties", "code")),
    ).toEqual([...OPENAPI_QUERY_ERROR_CODES]);
    expect(OPENAPI_QUERY_ERROR_CODES).toContain("TARGET_BLOCKED");
  });

  it("lists the same HTTP error codes as the Public API page", () => {
    const html = renderToStaticMarkup(<PublicApiPage />);
    const section = /id="errors">([\s\S]*?)<h2/u.exec(html)?.[1] ?? "";
    const documented = [...section.matchAll(/<code>([A-Z_]+)<\/code>/gu)].map(
      (match) => match[1],
    );
    expect(
      openEnumValues(
        at(schema("ApiError"), "properties", "error", "properties", "code"),
      ),
    ).toEqual([...OPENAPI_ERROR_CODES]);
    expect(documented).toEqual([...OPENAPI_ERROR_CODES]);
  });

  it("covers the error codes the handlers emit", async () => {
    const notFound = handlePublicApiNotFound(new Request(`${API_URL}/nope`));
    const notAllowed = handlePublicApiOpenApi(
      new Request(`${API_URL}/openapi.json`, { method: "POST" }),
    );
    for (const response of [notFound, notAllowed]) {
      const body = (await response.json()) as {
        readonly error: { readonly code: string };
      };
      expect(OPENAPI_ERROR_CODES).toContain(body.error.code);
    }
  });

  it("links the spec from the Public API page", () => {
    expect(renderToStaticMarkup(<PublicApiPage />)).toContain(
      'href="/api/v1/openapi.json"',
    );
  });
});

describe("GET /api/v1/openapi.json", () => {
  it("serves the document with open CORS and ETag revalidation", async () => {
    const response = handlePublicApiOpenApi(
      new Request(`${API_URL}/openapi.json`),
    );
    const etag = response.headers.get("etag") ?? "";

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, max-age=300");
    expect(etag).toMatch(/^W\/"[\w-]{27}"$/u);
    expect(await response.json()).toEqual(document);

    const revalidated = handlePublicApiOpenApi(
      new Request(`${API_URL}/openapi.json`, {
        headers: { "If-None-Match": etag },
      }),
    );
    expect(revalidated.status).toBe(304);
    expect(await revalidated.text()).toBe("");
  });

  it("answers HEAD without a body and preflights cross-origin reads", async () => {
    const head = handlePublicApiOpenApi(
      new Request(`${API_URL}/openapi.json`, { method: "HEAD" }),
    );
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");

    const preflight = handlePublicApiOpenApi(
      new Request(`${API_URL}/openapi.json`, { method: "OPTIONS" }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toBe(
      "GET, HEAD, OPTIONS",
    );
  });
});
