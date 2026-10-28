import type { PlaygroundQueryInput } from "./playground-contracts.js";
import { targetSegment } from "./result-url.js";

export const BADGE_STYLES = ["flat", "flat-square", "for-the-badge"] as const;
export const BADGE_SHOWS = ["players", "status", "players-map"] as const;
export const BADGE_THEMES = ["dark", "light", "auto"] as const;

export type BadgeStyle = (typeof BADGE_STYLES)[number];
export type BadgeShow = (typeof BADGE_SHOWS)[number];
export type BadgeTheme = (typeof BADGE_THEMES)[number];

/** How a badge is drawn. None of it changes which query backs the badge. */
export interface BadgeOptions {
  readonly style: BadgeStyle;
  readonly show: BadgeShow;
  readonly theme: BadgeTheme;
  /** Replaces the game name on the left; always passed through {@link badgeLabelText}. */
  readonly label?: string;
}

export const DEFAULT_BADGE_OPTIONS: BadgeOptions = {
  show: "players",
  style: "flat",
  theme: "dark",
};

/** Longest custom label, in code points. */
export const MAX_BADGE_LABEL_LENGTH = 32;

// Controls, format characters (bidi overrides, zero-width joiners), and line
// or paragraph separators never reach a label.
const LABEL_STRIPPED = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
// Letters, marks, digits, spaces, and plain punctuation. Slashes, `@`, `%`,
// `=`, quotes, and brackets are left out, so a label cannot spell a URL,
// an address, or markup on our domain.
const LABEL_ALLOWED = /^[\p{L}\p{M}\p{N} \-_.,:;!?&+'()#|·]+$/u;

/**
 * A custom badge label as it may be drawn, or undefined when it is empty,
 * longer than {@link MAX_BADGE_LABEL_LENGTH}, or uses anything outside
 * letters, digits, spaces, and plain punctuation.
 */
export function badgeLabelText(raw: string): string | undefined {
  if (raw.length > MAX_BADGE_LABEL_LENGTH * 4) {
    return undefined;
  }
  const text = raw
    .normalize("NFC")
    .replace(LABEL_STRIPPED, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (
    text.length === 0 ||
    Array.from(text).length > MAX_BADGE_LABEL_LENGTH ||
    !LABEL_ALLOWED.test(text)
  ) {
    return undefined;
  }
  return text;
}

function closedValue<T extends string>(
  values: readonly T[],
  raw: string | null,
  fallback: T,
): T {
  return values.find((value) => value === raw) ?? fallback;
}

/**
 * Reads `style`, `show`, `theme`, and `label`. Unknown values fall back to the
 * default and an unusable label is ignored, so a typo never breaks a badge.
 */
export function parseBadgeOptions(search: URLSearchParams): BadgeOptions {
  const rawLabel = search.get("label");
  const label = rawLabel === null ? undefined : badgeLabelText(rawLabel);
  return {
    show: closedValue(BADGE_SHOWS, search.get("show"), "players"),
    style: closedValue(BADGE_STYLES, search.get("style"), "flat"),
    theme: closedValue(BADGE_THEMES, search.get("theme"), "dark"),
    ...(label === undefined ? {} : { label }),
  };
}

function setOptions(
  url: URL,
  options: Partial<BadgeOptions>,
  withTheme: boolean,
): void {
  if (options.style !== undefined && options.style !== "flat") {
    url.searchParams.set("style", options.style);
  }
  if (options.show !== undefined && options.show !== "players") {
    url.searchParams.set("show", options.show);
  }
  if (withTheme && options.theme !== undefined && options.theme !== "dark") {
    url.searchParams.set("theme", options.theme);
  }
  const label =
    options.label === undefined ? undefined : badgeLabelText(options.label);
  if (label !== undefined) {
    url.searchParams.set("label", label);
  }
}

function imageUrl(
  origin: string,
  input: PlaygroundQueryInput,
  extension: ".json" | ".svg",
  options: Partial<BadgeOptions>,
): URL {
  const target = targetSegment(input.host, input.port);
  const url = new URL(
    `/api/v1/badge/${input.game}/${target}${extension}`,
    origin,
  );
  if (input.queryPort !== undefined) {
    url.searchParams.set("queryPort", String(input.queryPort));
  }
  // shields.io draws endpoint badges itself, so a theme would do nothing there.
  setOptions(url, options, extension === ".svg");
  return url;
}

/** The public badge URL for a query, on the given site origin. Default options are left out. */
export function badgeUrl(
  origin: string,
  input: PlaygroundQueryInput,
  options: Partial<BadgeOptions> = {},
): URL {
  return imageUrl(origin, input, ".svg", options);
}

/** The shields.io endpoint URL for a query; `theme` does not apply to it. */
export function badgeEndpointUrl(
  origin: string,
  input: PlaygroundQueryInput,
  options: Partial<BadgeOptions> = {},
): URL {
  return imageUrl(origin, input, ".json", options);
}

/** A shields.io badge drawn from {@link badgeEndpointUrl}. */
export function shieldsBadgeUrl(endpoint: URL): URL {
  const url = new URL("https://img.shields.io/endpoint");
  url.searchParams.set("url", endpoint.href);
  return url;
}

/** The embeddable status card for a query. */
export function embedUrl(
  origin: string,
  input: PlaygroundQueryInput,
  theme: BadgeTheme = "dark",
): URL {
  const target = targetSegment(input.host, input.port);
  const url = new URL(`/embed/${input.game}/${target}`, origin);
  if (input.queryPort !== undefined) {
    url.searchParams.set("queryPort", String(input.queryPort));
  }
  if (theme !== "dark") {
    url.searchParams.set("theme", theme);
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

/** An iframe that shows the status card at its designed size. */
export function embedHtml(gameName: string, embed: URL): string {
  return `<iframe src="${escapeAttribute(embed.href)}" title="${escapeAttribute(`${gameName} server status`)}" width="360" height="88" style="border:0" loading="lazy"></iframe>`;
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
