import type { BadgeShow, BadgeStyle, BadgeTheme } from "../lib/badge-url.js";
import { escapeMarkup } from "./http-shared.js";

/** What a status badge reports about one server. */
export type BadgeState =
  | {
      readonly kind: "online";
      readonly partial: boolean;
      readonly online?: number;
      readonly max?: number;
      /** The server's reported name; link previews and embed cards show it, badges do not. */
      readonly name?: string;
      /** The reported map, without control characters. */
      readonly map?: string;
      /** A validated 64×64 PNG data URL, for Minecraft: Java Edition. */
      readonly favicon?: string;
    }
  | { readonly kind: "offline" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" };

interface BadgeTone {
  readonly background: string;
  readonly text: string;
}

interface BadgePalette {
  readonly label: BadgeTone;
  readonly online: BadgeTone;
  readonly partial: BadgeTone;
  readonly muted: BadgeTone;
}

// The site's dark palette (see src/styles/base.css). Badges render as plain
// images on third-party pages, so the values are literal rather than tokens.
const DARK_PALETTE: BadgePalette = {
  label: { background: "#10191d", text: "#dce7e4" },
  muted: { background: "#364a50", text: "#f3f8f6" },
  online: { background: "#55d7ba", text: "#04201a" },
  partial: { background: "#e2a95f", text: "#2a1c08" },
};

// Deeper status colours keep white text above 4.5:1 on light pages.
const LIGHT_PALETTE: BadgePalette = {
  label: { background: "#e4ecea", text: "#10191d" },
  muted: { background: "#5d6e73", text: "#ffffff" },
  online: { background: "#137a63", text: "#ffffff" },
  partial: { background: "#8f5614", text: "#ffffff" },
};

/** The palette a theme draws with; `auto` starts dark and switches by media query. */
export function badgePalette(theme: BadgeTheme): BadgePalette {
  return theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
}

interface BadgeMetrics {
  readonly height: number;
  readonly padding: number;
  readonly dotSpace: number;
  readonly fontSize: number;
  readonly radius: number;
  readonly textY: number;
  readonly uppercase: boolean;
}

const FLAT_METRICS: BadgeMetrics = {
  dotSpace: 10,
  fontSize: 11,
  height: 20,
  padding: 7,
  radius: 4,
  textY: 14,
  uppercase: false,
};

const STYLE_METRICS: Readonly<Record<BadgeStyle, BadgeMetrics>> = {
  flat: FLAT_METRICS,
  "flat-square": { ...FLAT_METRICS, radius: 0 },
  "for-the-badge": {
    dotSpace: 12,
    fontSize: 10,
    height: 28,
    padding: 10,
    radius: 0,
    textY: 18,
    uppercase: true,
  },
};

const MAX_LABEL_LENGTH = 40;
const MAX_MAP_LENGTH = 24;
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

// Approximate Verdana advance widths at 11px. `textLength` pins the rendered
// width, so a substituted font only changes letter spacing, never clipping.
const CHARACTER_WIDTHS: Readonly<Record<string, number>> = {
  " ": 3.9,
  "!": 4.3,
  "&": 7.8,
  "'": 3,
  "(": 4.9,
  ")": 4.9,
  "+": 9,
  ",": 3.9,
  "-": 4.9,
  ".": 3.9,
  "/": 4.9,
  ":": 4.5,
  "0": 7,
  "1": 7,
  "2": 7,
  "3": 7,
  "4": 7,
  "5": 7,
  "6": 7,
  "7": 7,
  "8": 7,
  "9": 7,
  A: 7.5,
  B: 7.5,
  C: 7.7,
  D: 8.5,
  E: 7,
  F: 6.3,
  G: 8.5,
  H: 8.3,
  I: 4.6,
  J: 5,
  K: 7.6,
  L: 6.1,
  M: 9.3,
  N: 8.2,
  O: 8.7,
  P: 6.6,
  Q: 8.7,
  R: 7.7,
  S: 7.5,
  T: 6.8,
  U: 8.1,
  V: 7.5,
  W: 10.9,
  X: 7.5,
  Y: 6.8,
  Z: 7.5,
  a: 6.7,
  b: 6.8,
  c: 5.7,
  d: 6.8,
  e: 6.6,
  f: 3.9,
  g: 6.8,
  h: 7,
  i: 3,
  j: 3.8,
  k: 6.5,
  l: 3,
  m: 10.7,
  n: 7,
  o: 6.7,
  p: 6.8,
  q: 6.8,
  r: 4.7,
  s: 5.7,
  t: 4.3,
  u: 7,
  v: 6.5,
  w: 9,
  x: 6.5,
  y: 6.5,
  z: 5.8,
};

function textWidth(text: string): number {
  let width = 0;
  for (const character of text) {
    width += CHARACTER_WIDTHS[character] ?? 7;
  }
  return Math.ceil(width);
}

/** Width of drawn text; uppercase bold text at 10px runs wider than the 11px table. */
function drawnWidth(text: string, metrics: BadgeMetrics): number {
  if (!metrics.uppercase) {
    return textWidth(text);
  }
  return Math.ceil(textWidth(text) * 0.98 + Array.from(text).length * 1.2);
}

function truncate(text: string, maximum: number): string {
  const characters = Array.from(text);
  return characters.length > maximum
    ? `${characters.slice(0, maximum - 1).join("")}…`
    : text;
}

function playerText(state: Extract<BadgeState, { kind: "online" }>): string {
  // An unconfirmed count is left out rather than shown as zero.
  if (state.online === undefined) {
    return "online";
  }
  const online = COUNT_FORMAT.format(state.online);
  return state.max === undefined
    ? `${online} online`
    : `${online}/${COUNT_FORMAT.format(state.max)} online`;
}

/** The status half of a badge, also used for its accessible name. */
export function badgeStatusText(state: BadgeState): string {
  switch (state.kind) {
    case "online":
      return playerText(state);
    case "offline":
      return "offline";
    case "unavailable":
      return "unavailable";
    case "invalid":
      return "invalid server";
  }
}

/** The status half of a badge for a `show` option. */
export function badgeMessage(state: BadgeState, show: BadgeShow): string {
  if (show === "status") {
    return state.kind === "online" ? "online" : badgeStatusText(state);
  }
  const status = badgeStatusText(state);
  if (show === "players-map" && state.kind === "online") {
    const map = state.map?.trim();
    if (map !== undefined && map.length > 0) {
      return `${status} · ${truncate(map, MAX_MAP_LENGTH)}`;
    }
  }
  return status;
}

/** Which palette entry colours the status half. */
export function statusToneKey(
  state: BadgeState,
): "online" | "partial" | "muted" {
  if (state.kind === "online") {
    return state.partial ? "partial" : "online";
  }
  return "muted";
}

/** Light-theme overrides for `theme=auto`, keyed by the classes below. */
function autoThemeStyle(state: BadgeState): string {
  const tone = LIGHT_PALETTE[statusToneKey(state)];
  const label = LIGHT_PALETTE.label;
  return `<style>@media (prefers-color-scheme:light){.lb{fill:${label.background}}.lt{fill:${label.text}}.sb{fill:${tone.background}}.st{fill:${tone.text}}}</style>`;
}

function classAttribute(name: string, themed: boolean): string {
  return themed ? ` class="${name}"` : "";
}

function textElement(
  text: string,
  x: number,
  y: number,
  width: number,
  color: string,
  className: string,
): string {
  return `<text${className} x="${x}" y="${y}" fill="${color}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${escapeMarkup(text)}</text>`;
}

/** How one badge is drawn; omitted fields use the default flat, dark, player-count badge. */
export interface BadgeRenderOptions {
  readonly style?: BadgeStyle;
  readonly show?: BadgeShow;
  readonly theme?: BadgeTheme;
}

/**
 * Renders a self-contained status badge: the label on the left and the
 * server's state on the right. All text is escaped, and the SVG references no
 * external resources, scripts, or fonts; `theme=auto` adds only an inline
 * colour-scheme media query.
 */
export function renderBadgeSvg(
  label: string,
  state: BadgeState,
  options: BadgeRenderOptions = {},
): string {
  const metrics = STYLE_METRICS[options.style ?? "flat"];
  const theme = options.theme ?? "dark";
  const themed = theme === "auto";
  const palette = badgePalette(theme);
  const labelTone = palette.label;
  const tone = palette[statusToneKey(state)];
  const safeLabel = truncate(label, MAX_LABEL_LENGTH);
  const status = badgeMessage(state, options.show ?? "players");
  const shownLabel = metrics.uppercase ? safeLabel.toUpperCase() : safeLabel;
  const shownStatus = metrics.uppercase ? status.toUpperCase() : status;
  const { dotSpace, height, padding } = metrics;
  const labelTextWidth = drawnWidth(shownLabel, metrics);
  const statusTextWidth = drawnWidth(shownStatus, metrics);
  const labelWidth = labelTextWidth + padding * 2;
  const statusWidth = dotSpace + statusTextWidth + padding * 2;
  const width = labelWidth + statusWidth;
  const title = escapeMarkup(`${safeLabel}, ${status}`);
  const statusX = labelWidth + padding + dotSpace;
  const fontWeight = metrics.uppercase ? ` font-weight="bold"` : "";
  const rects = [
    `<rect${classAttribute("lb", themed)} width="${labelWidth}" height="${height}" fill="${labelTone.background}"/>`,
    `<rect${classAttribute("sb", themed)} x="${labelWidth}" width="${statusWidth}" height="${height}" fill="${tone.background}"/>`,
  ];

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    themed ? autoThemeStyle(state) : "",
    ...(metrics.radius > 0
      ? [
          `<clipPath id="r"><rect width="${width}" height="${height}" rx="${metrics.radius}"/></clipPath>`,
          `<g clip-path="url(#r)">`,
          ...rects,
          `</g>`,
        ]
      : rects),
    `<circle${classAttribute("st", themed)} cx="${labelWidth + padding + 3}" cy="${height / 2}" r="3" fill="${tone.text}"/>`,
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${metrics.fontSize}"${fontWeight}>`,
    textElement(
      shownLabel,
      padding,
      metrics.textY,
      labelTextWidth,
      labelTone.text,
      classAttribute("lt", themed),
    ),
    textElement(
      shownStatus,
      statusX,
      metrics.textY,
      statusTextWidth,
      tone.text,
      classAttribute("st", themed),
    ),
    `</g>`,
    `</svg>`,
  ].join("");
}
