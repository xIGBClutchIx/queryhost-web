import type { BadgeState } from "./badge-svg.js";

/** Everything one result's link preview shows. */
export interface PreviewCard {
  /** `host` or `host:port`, as the result page names it. */
  readonly address: string;
  readonly gameName: string;
  /** The server's reported name, already stripped of game formatting codes. */
  readonly serverName?: string;
  readonly state: BadgeState;
}

export const PREVIEW_WIDTH = 1200;
export const PREVIEW_HEIGHT = 630;

// The site's dark palette (see src/styles/base.css). The PNG is rendered
// without a browser, so the values are literal rather than tokens.
const BACKGROUND = "#0b1215";
const SURFACE_RAISED = "#131e22";
const TEXT_STRONG = "#f3f8f6";
const MUTED = "#95a6a2";
const FAINT = "#7f918c";
const ACCENT = "#55d7ba";
const ACCENT_SOFT = "#123b34";
const WARNING = "#e2a95f";

const SANS = "Geist";
const MONO = "Geist Mono";
const LEFT = 72;
const CONTENT_WIDTH = PREVIEW_WIDTH - LEFT * 2;
const COUNT_FORMAT = new Intl.NumberFormat("en-US");

// resvg lays text out without a browser, so widths are estimated from average
// advances: generous for Geist, exact for Geist Mono's fixed 0.6 em.
const SANS_ADVANCE_EM = 0.6;
const MONO_ADVANCE_EM = 0.6;
// Tight letter spacing makes large titles narrower than body text.
const TITLE_ADVANCE_EM = 0.52;

function escapeXml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Drops control characters, which are invalid in XML or render as boxes. */
function printable(text: string): string {
  return text.replaceAll(/[\p{Cc}\p{Cs}￾￿]/gu, " ").trim();
}

const GRAPHEMES = new Intl.Segmenter("en", { granularity: "grapheme" });

/** User-perceived characters, so emoji and combining marks stay whole. */
function graphemes(text: string): string[] {
  return Array.from(GRAPHEMES.segment(text), ({ segment }) => segment);
}

/** Cuts text to an estimated width, ending it with an ellipsis when cut. */
export function fitText(
  text: string,
  fontSize: number,
  advanceEm: number,
  maxWidth: number,
): string {
  const characters = graphemes(text);
  const fits = Math.floor(maxWidth / (fontSize * advanceEm));
  if (characters.length <= fits) {
    return text;
  }
  return `${characters
    .slice(0, Math.max(1, fits - 1))
    .join("")
    .trimEnd()}…`;
}

interface StatusLine {
  readonly color: string;
  readonly text: string;
}

function statusLine(state: BadgeState): StatusLine {
  switch (state.kind) {
    case "online": {
      // An unconfirmed count is left out rather than shown as zero.
      const players =
        state.online === undefined
          ? undefined
          : state.max === undefined
            ? `${COUNT_FORMAT.format(state.online)} players`
            : `${COUNT_FORMAT.format(state.online)} / ${COUNT_FORMAT.format(state.max)} players`;
      const label = state.partial ? "Online · partial" : "Online";
      return {
        color: state.partial ? WARNING : ACCENT,
        text: players === undefined ? label : `${label} · ${players}`,
      };
    }
    case "offline":
      return { color: FAINT, text: "Offline or unreachable" };
    case "unavailable":
      return { color: FAINT, text: "Live status on QueryHost" };
    case "invalid":
      return { color: FAINT, text: "Invalid server" };
  }
}

/**
 * Renders the 1200×630 link preview for one result: the game, the server's
 * name or address, and its live state. All text is escaped and fitted, and the
 * SVG references only the fonts the PNG renderer loads.
 */
export function renderPreviewSvg(card: PreviewCard): string {
  const serverName =
    card.serverName === undefined ? "" : printable(card.serverName);
  const address = printable(card.address);
  const title = serverName.length > 0 ? serverName : address;
  const titleSize = graphemes(title).length > 24 ? 60 : 76;
  const status = statusLine(card.state);
  const statusSize = 28;
  const statusText = fitText(
    status.text,
    statusSize,
    SANS_ADVANCE_EM,
    CONTENT_WIDTH - 96,
  );
  const pillWidth = Math.ceil(
    graphemes(statusText).length * statusSize * 0.47 + 88,
  );
  const gameY = 236;
  const titleY = gameY + 22 + titleSize;
  const addressY = titleY + 58;
  const pillY = (serverName.length > 0 ? addressY : titleY) + 60;

  const lines = [
    `<text x="${LEFT}" y="${gameY}" fill="${MUTED}" font-family="${SANS}" font-size="30" font-weight="500">${escapeXml(fitText(printable(card.gameName), 30, SANS_ADVANCE_EM, CONTENT_WIDTH))}</text>`,
    `<text x="${LEFT}" y="${titleY}" fill="${TEXT_STRONG}" font-family="${SANS}" font-size="${titleSize}" font-weight="600" letter-spacing="${-titleSize * 0.035}">${escapeXml(fitText(title, titleSize, TITLE_ADVANCE_EM, CONTENT_WIDTH))}</text>`,
  ];
  if (serverName.length > 0) {
    lines.push(
      `<text x="${LEFT}" y="${addressY}" fill="${FAINT}" font-family="${MONO}" font-size="28" font-weight="500">${escapeXml(fitText(address, 28, MONO_ADVANCE_EM, CONTENT_WIDTH))}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" viewBox="0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}">
<defs><radialGradient id="glow" cx="600" cy="420" r="640" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${ACCENT_SOFT}" stop-opacity="0.7"/><stop offset="1" stop-color="${ACCENT_SOFT}" stop-opacity="0"/></radialGradient></defs>
<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="${BACKGROUND}"/>
<rect width="${PREVIEW_WIDTH}" height="${PREVIEW_HEIGHT}" fill="url(#glow)"/>
<g transform="translate(${LEFT} 56) scale(0.6875)" fill="none" stroke="${ACCENT}" stroke-linecap="round" stroke-width="5"><circle cx="30" cy="30" r="18.5"/><path d="m43 43 10 10"/><path d="M23 26h14M23 34h14"/></g>
<text x="${LEFT + 58}" y="90" font-family="${SANS}" font-size="34" font-weight="600" letter-spacing="-1.2"><tspan fill="${ACCENT}">Query</tspan><tspan fill="${TEXT_STRONG}">Host</tspan></text>
${lines.join("\n")}
<g transform="translate(${LEFT} ${pillY})"><rect width="${pillWidth}" height="64" rx="32" fill="${SURFACE_RAISED}" fill-opacity="0.75" stroke="${TEXT_STRONG}" stroke-opacity="0.11" stroke-width="1.5"/><circle cx="34" cy="32" r="8" fill="${status.color}"/><text x="56" y="42" fill="${TEXT_STRONG}" font-family="${SANS}" font-size="${statusSize}" font-weight="500">${escapeXml(statusText)}</text></g>
<text x="${PREVIEW_WIDTH - LEFT}" y="${PREVIEW_HEIGHT - 56}" fill="${FAINT}" font-family="${MONO}" font-size="22" font-weight="500" text-anchor="end">query.host</text>
</svg>`;
}
