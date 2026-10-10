/** What a status badge reports about one server. */
export type BadgeState =
  | {
      readonly kind: "online";
      readonly partial: boolean;
      readonly online?: number;
      readonly max?: number;
      /** The server's reported name; link previews show it, badges do not. */
      readonly name?: string;
    }
  | { readonly kind: "offline" }
  | { readonly kind: "unavailable" }
  | { readonly kind: "invalid" };

interface BadgeTone {
  readonly background: string;
  readonly text: string;
}

// The site's dark palette (see src/styles/base.css). Badges render as plain
// images on third-party pages, so the values are literal rather than tokens.
const LABEL_TONE: BadgeTone = { background: "#10191d", text: "#dce7e4" };
const ONLINE_TONE: BadgeTone = { background: "#55d7ba", text: "#04201a" };
const PARTIAL_TONE: BadgeTone = { background: "#e2a95f", text: "#2a1c08" };
const MUTED_TONE: BadgeTone = { background: "#364a50", text: "#f3f8f6" };

const HEIGHT = 20;
const PADDING = 7;
const DOT_SPACE = 10;
const FONT_SIZE = 11;
const MAX_LABEL_LENGTH = 40;
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

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
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

function statusTone(state: BadgeState): BadgeTone {
  if (state.kind === "online") {
    return state.partial ? PARTIAL_TONE : ONLINE_TONE;
  }
  return MUTED_TONE;
}

function textElement(
  text: string,
  x: number,
  width: number,
  color: string,
): string {
  return `<text x="${x}" y="14" fill="${color}" textLength="${width}" lengthAdjust="spacingAndGlyphs">${escapeXml(text)}</text>`;
}

/**
 * Renders a self-contained status badge: the game name on the left and the
 * server's state on the right. All text is escaped, and the SVG references no
 * external resources, scripts, or fonts.
 */
export function renderBadgeSvg(label: string, state: BadgeState): string {
  const safeLabel =
    label.length > MAX_LABEL_LENGTH
      ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…`
      : label;
  const status = badgeStatusText(state);
  const tone = statusTone(state);
  const labelTextWidth = textWidth(safeLabel);
  const statusTextWidth = textWidth(status);
  const labelWidth = labelTextWidth + PADDING * 2;
  const statusWidth = DOT_SPACE + statusTextWidth + PADDING * 2;
  const width = labelWidth + statusWidth;
  const title = escapeXml(`${safeLabel}, ${status}`);
  const statusX = labelWidth + PADDING + DOT_SPACE;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" viewBox="0 0 ${width} ${HEIGHT}" role="img" aria-label="${title}">`,
    `<title>${title}</title>`,
    `<clipPath id="r"><rect width="${width}" height="${HEIGHT}" rx="4"/></clipPath>`,
    `<g clip-path="url(#r)">`,
    `<rect width="${labelWidth}" height="${HEIGHT}" fill="${LABEL_TONE.background}"/>`,
    `<rect x="${labelWidth}" width="${statusWidth}" height="${HEIGHT}" fill="${tone.background}"/>`,
    `</g>`,
    `<circle cx="${labelWidth + PADDING + 3}" cy="10" r="3" fill="${tone.text}"/>`,
    `<g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_SIZE}">`,
    textElement(safeLabel, PADDING, labelTextWidth, LABEL_TONE.text),
    textElement(status, statusX, statusTextWidth, tone.text),
    `</g>`,
    `</svg>`,
  ].join("");
}
