export const BRAND_ICON_URL = "/favicon.svg?v=2";
export const GITHUB_REPOSITORY_URL =
  "https://github.com/xIGBClutchIx/queryhost";
export const SITE_HOSTNAME = "query.host";
/** Link-preview image, rendered from `scripts/share-image.html`; bump `v` when it changes. */
export const SHARE_IMAGE = {
  alt: "QueryHost: look up any game server. A game, host, and port form with a Query button.",
  height: 630,
  path: "/share.png?v=2",
  width: 1200,
} as const;
/** Homepage headline, shared by the visible hero and the page title. */
export const HOME_HEADLINE = "Look up any game server";
/** Homepage subline, shared by the visible hero and the meta and Open Graph descriptions. */
export const HOME_SUMMARY =
  "Check its live status right in your browser. Developers can run the same queries with the QueryHost library and API.";

/** Returns the same-origin URL of a clean documentation path. */
export function documentationHref(pathname = "/"): string {
  const cleanPath =
    pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
  return cleanPath === "/" ? "/docs/" : `/docs${cleanPath}`;
}

/** Returns the production URL search engines and link previews should use. */
export function canonicalUrl(pathname: string): string {
  return new URL(pathname, `https://${SITE_HOSTNAME}`).href;
}

/**
 * Cache policy for `GET /api/v1/games` and `/api/v1/openapi.json`. Both only
 * change on deploy, so clients may reuse them briefly and then revalidate
 * with their ETag.
 */
export const PUBLIC_API_STATIC_CACHE_CONTROL = "public, max-age=300";

const PUBLIC_API_STATIC_PATHS: ReadonlySet<string> = new Set([
  "/api/v1/games",
  "/api/v1/openapi.json",
]);

export function cacheControlForPath(pathname: string): string {
  if (PUBLIC_API_STATIC_PATHS.has(pathname)) {
    return PUBLIC_API_STATIC_CACHE_CONTROL;
  }

  if (
    pathname === "/health" ||
    pathname === "/mcp" ||
    pathname.startsWith("/api/")
  ) {
    return "no-store";
  }

  if (pathname.startsWith("/_astro/") || pathname.startsWith("/fonts/")) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=300, stale-while-revalidate=86400";
}
