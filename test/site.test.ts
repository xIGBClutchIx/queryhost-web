import { describe, expect, it } from "vitest";

import {
  cacheControlForPath,
  canonicalUrl,
  DOCS_HOSTNAME,
  GITHUB_REPOSITORY_URL,
  documentationHref,
  normalizeHostname,
  requestHostname,
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
  });

  it("keeps documentation links on the current origin", () => {
    expect(documentationHref()).toBe("/docs/");
    expect(documentationHref("/results")).toBe("/docs/results/");
    expect(documentationHref("//reference/query//")).toBe(
      "/docs/reference/query/",
    );
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
    expect(cacheControlForPath("/mcp")).toBe("no-store");
    expect(cacheControlForPath("/_astro/app.123.css")).toContain("immutable");
    expect(cacheControlForPath("/docs/results/")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });
});
