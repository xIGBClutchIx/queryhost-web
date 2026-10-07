import { describe, expect, it } from "vitest";

import {
  cacheControlForPath,
  canonicalUrl,
  DOCS_HOSTNAME,
  GITHUB_REPOSITORY_URL,
  documentationHref,
  experienceForHostname,
  internalApiPath,
  internalDocumentationPath,
  isInternalApiPath,
  isCanonicalHostname,
  normalizeHostname,
  requestHostname,
  siteHref,
} from "../src/lib/site.js";

describe("hostname routing", () => {
  it("normalizes forwarded host values without accepting ports or extra entries", () => {
    expect(normalizeHostname(" Docs.Query.Host.:443, proxy.internal")).toBe(
      DOCS_HOSTNAME,
    );
    expect(normalizeHostname("[::1]:4321")).toBe("::1");
  });

  it("prefers Railway's forwarded host over the internal request URL", () => {
    const request = new Request("http://web.railway.internal/", {
      headers: { "x-forwarded-host": "docs.query.host" },
    });
    expect(requestHostname(request)).toBe(DOCS_HOSTNAME);
    expect(experienceForHostname(requestHostname(request))).toBe("docs");
  });

  it("maps only versioned public API paths on the API domain", () => {
    expect(internalApiPath("/v1/query")).toBe("/api/v1/query");
    expect(internalApiPath("/v1/games/")).toBe("/api/v1/games");
    expect(internalApiPath("/api/query")).toBeUndefined();
    expect(internalApiPath("/mcp")).toBeUndefined();
    expect(internalApiPath("/v2/query")).toBeUndefined();
    expect(isInternalApiPath("/api/v1/query")).toBe(true);
    expect(isInternalApiPath("/api/query")).toBe(false);
  });

  it("maps clean documentation paths to internal Astro routes", () => {
    expect(internalDocumentationPath("/")).toBe("/docs/");
    expect(internalDocumentationPath("/results")).toBe("/docs/results/");
    expect(internalDocumentationPath("//reference/query//")).toBe(
      "/docs/reference/query/",
    );
  });

  it("keeps all internal navigation on preview hosts", () => {
    expect(documentationHref("localhost", "/games/")).toBe("/docs/games/");
    expect(
      documentationHref("web-production-d8918.up.railway.app", "/games/"),
    ).toBe("/docs/games/");
    expect(siteHref("web-production-d8918.up.railway.app")).toBe("/");
  });

  it("crosses origins only between the canonical production domains", () => {
    expect(isCanonicalHostname("query.host")).toBe(true);
    expect(isCanonicalHostname("docs.query.host")).toBe(true);
    expect(isCanonicalHostname("preview.query.host")).toBe(false);
    expect(documentationHref("query.host", "/games/")).toBe(
      "https://docs.query.host/games/",
    );
    expect(siteHref("docs.query.host")).toBe("https://query.host/");
  });
});

describe("canonical URLs", () => {
  it("points documentation at the docs domain and site pages at query.host", () => {
    expect(canonicalUrl("/")).toBe("https://query.host/");
    expect(canonicalUrl("/privacy/")).toBe("https://query.host/privacy/");
    expect(canonicalUrl("/docs/")).toBe("https://docs.query.host/");
    expect(canonicalUrl("/docs")).toBe("https://docs.query.host/");
    expect(canonicalUrl("/docs/reference/query/")).toBe(
      "https://docs.query.host/reference/query/",
    );
    expect(canonicalUrl("/docsearch/")).toBe("https://query.host/docsearch/");
  });
});

describe("public destinations", () => {
  it("points source links at the QueryHost library repository", () => {
    expect(GITHUB_REPOSITORY_URL).toBe(
      "https://github.com/xIGBClutchIx/queryhost",
    );
  });
});

describe("cache policy", () => {
  it("keeps health uncached and hashes immutable while pages remain short-lived", () => {
    expect(cacheControlForPath("/health")).toBe("no-store");
    expect(cacheControlForPath("/api/query")).toBe("no-store");
    expect(cacheControlForPath("/mcp")).toBe("no-store");
    expect(cacheControlForPath("/_astro/app.123.css")).toContain("immutable");
    expect(cacheControlForPath("/docs/results/")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });
});
