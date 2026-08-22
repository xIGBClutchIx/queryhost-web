export type SiteExperience = "docs" | "site";

export const DOCS_HOSTNAME = "docs.query.host";
export const SITE_HOSTNAME = "query.host";

const LOCAL_HOSTNAMES: ReadonlySet<string> = new Set([
  "127.0.0.1",
  "localhost",
  "::1",
]);

/** Normalizes a Host-style value without accepting a path, credentials, or scheme. */
export function normalizeHostname(value: string): string {
  const firstValue = value.split(",", 1)[0]?.trim().toLowerCase() ?? "";
  if (firstValue.startsWith("[")) {
    const closingBracket = firstValue.indexOf("]");
    return closingBracket === -1 ? "" : firstValue.slice(1, closingBracket);
  }

  return firstValue.split(":", 1)[0]?.replace(/\.$/, "") ?? "";
}

/** Uses Railway's forwarded host when present and the request URL everywhere else. */
export function requestHostname(request: Request): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  return forwardedHost === null
    ? normalizeHostname(new URL(request.url).hostname)
    : normalizeHostname(forwardedHost);
}

export function experienceForHostname(hostname: string): SiteExperience {
  return normalizeHostname(hostname) === DOCS_HOSTNAME ? "docs" : "site";
}

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTNAMES.has(normalizeHostname(hostname));
}

/** Maps a public clean documentation path to its internal Astro route. */
export function internalDocumentationPath(pathname: string): string {
  const cleanPath =
    pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
  return cleanPath === "/" ? "/docs/" : `/docs${cleanPath}`;
}

/** Returns the public documentation URL for production and the local route during development. */
export function documentationHref(hostname: string, pathname = "/"): string {
  const normalizedPath =
    pathname === "/" ? "/" : `/${pathname.replace(/^\/+|\/+$/g, "")}/`;
  if (isLocalHostname(hostname)) {
    return internalDocumentationPath(normalizedPath);
  }

  return `https://${DOCS_HOSTNAME}${normalizedPath}`;
}

export function siteHref(hostname: string): string {
  return isLocalHostname(hostname) ? "/" : `https://${SITE_HOSTNAME}/`;
}

export function cacheControlForPath(pathname: string): string {
  if (pathname === "/health") {
    return "no-store";
  }

  if (pathname.startsWith("/_astro/") || pathname.startsWith("/fonts/")) {
    return "public, max-age=31536000, immutable";
  }

  return "public, max-age=300, stale-while-revalidate=86400";
}
