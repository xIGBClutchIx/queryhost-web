import type { PlaygroundQueryInput } from "./playground-contracts.js";

/** The public badge URL for a query, on the given site origin. */
export function badgeUrl(origin: string, input: PlaygroundQueryInput): URL {
  // IPv6 literals are bracketed so their colons are not read as a port.
  const host = input.host.includes(":") ? `[${input.host}]` : input.host;
  const port = input.port === undefined ? "" : `:${input.port}`;
  const url = new URL(`/api/v1/badge/${input.game}/${host}${port}.svg`, origin);
  if (input.queryPort !== undefined) {
    url.searchParams.set("queryPort", String(input.queryPort));
  }
  return url;
}

/** Markdown that embeds the badge and links it to the prefilled playground. */
export function badgeMarkdown(
  gameName: string,
  badge: URL,
  playground: URL,
): string {
  return `[![${gameName} server status](${badge.href})](${playground.href})`;
}
