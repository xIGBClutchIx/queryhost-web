import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { API_REFERENCE_PAGES } from "../src/lib/api-reference.js";
import { DOCUMENTATION_NAVIGATION } from "../src/lib/navigation.js";
import { SHARE_IMAGE } from "../src/lib/site.js";
import {
  renderRobots,
  renderSitemap,
  sitemapPaths,
} from "../src/lib/sitemap.js";

describe("sitemap", () => {
  it("lists the site pages, every documentation page, and every reference page once", () => {
    const paths = sitemapPaths();

    expect(paths.slice(0, 3)).toEqual(["/", "/privacy/", "/terms/"]);
    for (const item of DOCUMENTATION_NAVIGATION.flatMap((s) => s.items)) {
      expect(paths).toContain(
        item.href === "/" ? "/docs/" : `/docs${item.href}`,
      );
    }
    const references = API_REFERENCE_PAGES.filter((page) => page.slug !== "");
    expect(references.length).toBeGreaterThan(0);
    for (const page of references) {
      expect(paths).toContain(`/docs/reference/${page.slug}/`);
    }
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.endsWith("/"))).toBe(true);
  });

  it("renders canonical query.host URLs with XML escaping", () => {
    const xml = renderSitemap(["/", "/docs/a&b/"]);

    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    );
    expect(xml).toContain("<loc>https://query.host/</loc>");
    expect(xml).toContain("<loc>https://query.host/docs/a&amp;b/</loc>");
  });
});

describe("robots.txt", () => {
  it("allows pages, keeps crawlers off machine endpoints, and links the sitemap", () => {
    const robots = renderRobots();

    expect(robots).toContain("User-agent: *\nAllow: /\n");
    expect(robots).toContain("Disallow: /api/\n");
    expect(robots).toContain("Disallow: /mcp\n");
    expect(robots).toContain("Sitemap: https://query.host/sitemap.xml\n");
  });
});

describe("share image", () => {
  it("ships a PNG whose dimensions match the declared meta tags", () => {
    const png = readFileSync(new URL("../public/share.png", import.meta.url));

    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(SHARE_IMAGE.width);
    expect(png.readUInt32BE(20)).toBe(SHARE_IMAGE.height);
    expect(SHARE_IMAGE.path.split("?")[0]).toBe("/share.png");
  });
});
