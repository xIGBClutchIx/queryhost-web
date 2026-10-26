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

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;");
}

/** HTML that embeds the badge and links it to the server's result page. */
export function badgeHtml(
  gameName: string,
  badge: URL,
  playground: URL,
): string {
  return `<a href="${escapeAttribute(playground.href)}"><img src="${escapeAttribute(badge.href)}" alt="${escapeAttribute(`${gameName} server status`)}"></a>`;
}

/** A shell command that runs the same query through the public API. */
export function apiCurlCommand(
  origin: string,
  input: PlaygroundQueryInput,
): string {
  const body = JSON.stringify({
    game: input.game,
    host: input.host,
    ...(input.port === undefined ? {} : { port: input.port }),
    ...(input.queryPort === undefined ? {} : { queryPort: input.queryPort }),
    ...(input.mode === undefined ? {} : { mode: input.mode }),
  });
  // Single-quoted for POSIX shells; any quote in the body is closed and escaped.
  const quoted = body.replaceAll("'", "'\\''");
  return `curl ${new URL("/api/v1/query", origin).href} -H 'Content-Type: application/json' -d '${quoted}'`;
}
