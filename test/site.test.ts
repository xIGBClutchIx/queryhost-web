import { describe, expect, it } from "vitest";

import {
  cacheControlForPath,
  DOCS_HOSTNAME,
  documentationHref,
  experienceForHostname,
  internalDocumentationPath,
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
    expect(experienceForHostname(requestHostname(request))).toBe("docs");
  });

  it("maps clean documentation paths to internal Astro routes", () => {
    expect(internalDocumentationPath("/")).toBe("/docs/");
    expect(internalDocumentationPath("/results")).toBe("/docs/results/");
    expect(internalDocumentationPath("//reference/query//")).toBe(
      "/docs/reference/query/",
    );
  });

  it("uses local documentation routes without changing production domains", () => {
    expect(documentationHref("localhost", "/games/")).toBe("/docs/games/");
    expect(documentationHref("query.host", "/games/")).toBe(
      "https://docs.query.host/games/",
    );
  });
});

describe("cache policy", () => {
  it("keeps health uncached and hashes immutable while pages remain short-lived", () => {
    expect(cacheControlForPath("/health")).toBe("no-store");
    expect(cacheControlForPath("/_astro/app.123.css")).toContain("immutable");
    expect(cacheControlForPath("/docs/results/")).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });
});
