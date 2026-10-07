export const BRAND_ICON_URL = "/favicon.svg?v=2";
export const GITHUB_REPOSITORY_URL =
  "https://github.com/xIGBClutchIx/queryhost";
export const SITE_HOSTNAME = "query.host";
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

export function cacheControlForPath(pathname: string): string {
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
