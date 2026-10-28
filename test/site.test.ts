import { describe, expect, it } from "vitest";

import {
  cacheControlForPath,
  canonicalUrl,
  GITHUB_REPOSITORY_URL,
  documentationHref,
  trailingSlashRedirect,
} from "../src/lib/site.js";

describe("documentation links", () => {
  it("keeps documentation links on the current origin", () => {
    expect(documentationHref()).toBe("/docs/");
    expect(documentationHref("/results")).toBe("/docs/results/");
    expect(documentationHref("//reference/query//")).toBe(
      "/docs/reference/query/",
    );
  });
});

describe("trailing-slash redirects", () => {
  it("sends slashless documentation and policy pages to their canonical path", () => {
    expect(trailingSlashRedirect("/docs")).toBe("/docs/");
    expect(trailingSlashRedirect("/docs/games")).toBe("/docs/games/");
    expect(trailingSlashRedirect("/docs/reference/functions/query")).toBe(
      "/docs/reference/functions/query/",
    );
    expect(trailingSlashRedirect("/privacy")).toBe("/privacy/");
    expect(trailingSlashRedirect("/terms")).toBe("/terms/");
  });

  it("leaves canonical pages, machine routes, files, and result pages alone", () => {
    for (const path of [
      "/",
      "/docs/",
      "/docs/games/",
      "/docs/search-index.json",
      "/api/v1/games",
      "/mcp",
      "/health",
      "/sitemap.xml",
      "/favicon.svg",
      "/rust/play.example.com",
      "/minecraft-java/mc",
      "/documents",
    ]) {
      expect(trailingSlashRedirect(path)).toBeUndefined();
    }
  });
});

describe("canonical URLs", () => {
  it("points every page, documentation included, at query.host", () => {
    expect(canonicalUrl("/")).toBe("https://query.host/");
    expect(canonicalUrl("/privacy/")).toBe("https://query.host/privacy/");
    expect(canonicalUrl("/docs/")).toBe("https://query.host/docs/");
    expect(canonicalUrl("/docs/reference/query/")).toBe(
      "https://query.host/docs/reference/query/",
    );
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
    expect(cacheControlForPath("/api/stats")).toBe("no-store");
    expect(cacheControlForPath("/api/v1/query")).toBe("no-store");
    expect(cacheControlForPath("/api/v1/games")).toBe("public, max-age=300");
    expect(cacheControlForPath("/api/v1/openapi.json")).toBe(
      "public, max-age=300",
    );
    expect(cacheControlForPath("/mcp")).toBe("no-store");
    expect(cacheControlForPath("/_astro/app.123.css")).toContain("immutable");
    expect(cacheControlForPath("/docs/results/")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });
});
