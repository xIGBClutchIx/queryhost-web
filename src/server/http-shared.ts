/** Header carrying the private API's origin token; it never leaves the server. */
export const ORIGIN_TOKEN_HEADER = "x-queryhost-origin-token";

/**
 * Escapes text for an XML or HTML text node or quoted attribute. The numeric
 * apostrophe reference is valid in both, unlike `&apos;` in older HTML.
 */
export function escapeMarkup(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * True when a `Content-Type` value names `mediaType`, compared without case
 * and ignoring parameters such as `charset`.
 */
export function hasMediaType(value: string | null, mediaType: string): boolean {
  if (value === null) {
    return false;
  }
  const [type = ""] = value.split(";", 1);
  return type.trim().toLowerCase() === mediaType;
}

/** True when a `Content-Type` value is `application/json`, with any parameters. */
export function isJsonMediaType(value: string | null): boolean {
  return hasMediaType(value, "application/json");
}

/**
 * True when an `If-None-Match` header names `etag` or `*`. The comparison is
 * weak, as the header requires: a `W/` prefix on either side is ignored.
 */
export function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) {
    return false;
  }
  const opaque = etag.replace(/^W\//u, "");
  return header
    .split(",")
    .map((tag) => tag.trim())
    .some((tag) => tag === "*" || tag.replace(/^W\//u, "") === opaque);
}
