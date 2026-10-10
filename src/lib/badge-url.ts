import type { PlaygroundQueryInput } from "./playground-contracts.js";
import { targetSegment } from "./result-url.js";

/** The public badge URL for a query, on the given site origin. */
export function badgeUrl(origin: string, input: PlaygroundQueryInput): URL {
  const target = targetSegment(input.host, input.port);
  const url = new URL(`/api/v1/badge/${input.game}/${target}.svg`, origin);
  if (input.queryPort !== undefined) {
    url.searchParams.set("queryPort", String(input.queryPort));
  }
  return url;
}

/** Markdown that embeds the badge and links it to the server's result page. */
export function badgeMarkdown(
  gameName: string,
  badge: URL,
  playground: URL,
): string {
  return `[![${gameName} server status](${badge.href})](${playground.href})`;
}
