import { API_REFERENCE_PAGES } from "./api-reference.js";
import { DOCUMENTATION_NAVIGATION } from "./navigation.js";
import { canonicalUrl, documentationHref } from "./site.js";

/** Site pages outside the documentation that search engines should index. */
const SITE_PATHS: readonly string[] = ["/", "/privacy/", "/terms/"];

/**
 * Every indexable page path: the site pages, each documentation page in
 * navigation order, then each generated API reference page.
 */
export function sitemapPaths(): readonly string[] {
  const documentation = DOCUMENTATION_NAVIGATION.flatMap((section) =>
    section.items.map((item) => documentationHref(item.href)),
  );
  // The empty slug is the reference index, already listed by the navigation.
  const reference = API_REFERENCE_PAGES.filter(
    (page) => page.slug.length > 0,
  ).map((page) => documentationHref(`/reference/${page.slug}`));

  return [...new Set([...SITE_PATHS, ...documentation, ...reference])];
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** The sitemap.xml document listing each path's canonical URL. */
export function renderSitemap(
  paths: readonly string[] = sitemapPaths(),
): string {
  const entries = paths
    .map((path) => `  <url><loc>${escapeXml(canonicalUrl(path))}</loc></url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries}
</urlset>
`;
}

/**
 * The robots.txt document: everything is crawlable except the machine
 * endpoints, which serve no pages and would only spend query capacity.
 */
export function renderRobots(): string {
  return `User-agent: *
Allow: /
Disallow: /api/
Disallow: /mcp

Sitemap: ${canonicalUrl("/sitemap.xml")}
`;
}
