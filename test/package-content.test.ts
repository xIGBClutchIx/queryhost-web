import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  API_REFERENCE_PAGES,
  apiReferencePage,
  renderApiReference,
} from "../src/lib/api-reference.js";
import { capabilityEntries, GAMES } from "../src/lib/queryhost.js";

describe("package-owned registry", () => {
  it("exposes distinct valid definitions with complete capability metadata", () => {
    expect(GAMES.length).toBeGreaterThan(0);
    expect(new Set(GAMES.map((game) => game.id)).size).toBe(GAMES.length);

    for (const game of GAMES) {
      expect(game.name.length).toBeGreaterThan(0);
      expect(Number.isInteger(game.defaultPort)).toBe(true);
      expect(capabilityEntries(game)).toHaveLength(7);
    }
  });
});

describe("browser query boundary", () => {
  it("addresses only the same-origin proxy and contains no private credentials", () => {
    const source = readFileSync(
      new URL("../src/components/QueryPlayground.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain('fetch("/api/query"');
    expect(source).not.toContain("QUERYHOST_API_BASE_URL");
    expect(source).not.toContain("QUERYHOST_API_ORIGIN_TOKEN");
    expect(source).not.toContain("railway.internal");
    expect(source).not.toContain("x-queryhost-origin-token");
  });
});

describe("packaged API reference", () => {
  it("discovers the generated package pages without duplicate slugs", () => {
    expect(API_REFERENCE_PAGES.length).toBeGreaterThan(40);
    expect(new Set(API_REFERENCE_PAGES.map((page) => page.slug)).size).toBe(
      API_REFERENCE_PAGES.length,
    );
    expect(apiReferencePage("functions/query")?.title).toContain("query");
    expect(apiReferencePage("type-aliases/CanonicalGameId")?.title).toBe(
      "Type Alias: CanonicalGameId<G>",
    );
  });

  it("rewrites generated Markdown links to documentation routes", () => {
    const page = apiReferencePage("functions/query");
    expect(page).toBeDefined();
    if (page === undefined) {
      throw new Error("The packaged query reference is missing.");
    }

    const html = renderApiReference(page, "/docs/reference");
    expect(html).toContain("/docs/reference/");
    expect(html).not.toMatch(/href="[^"]+\.md/);
  });

  it("removes TypeDoc's repeated page header while preserving the contract", () => {
    const page = apiReferencePage("functions/canonicalGameId");
    expect(page).toBeDefined();
    if (page === undefined) {
      throw new Error("The packaged canonicalGameId reference is missing.");
    }

    const html = renderApiReference(page, "/docs/reference");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<hr");
    expect(html).not.toContain(">queryhost</a> / canonicalGameId");
    expect(html).toContain("Resolves an accepted input identifier");
    expect(html).toContain("Type Parameters");
    expect(html).toContain("Returns");
  });

  it("syntax-highlights fenced examples with the dark code theme", () => {
    const html = renderApiReference(
      {
        category: "Functions",
        markdown: "# Example\n\n```ts\nconst online = true;\n```",
        slug: "functions/example",
        title: "Example",
      },
      "/docs/reference",
    );

    expect(html).toContain('class="shiki github-dark"');
    expect(html).not.toContain("--shiki-light");
    expect(html.replace(/<[^>]+>/g, "")).toContain("const online");
  });
});
