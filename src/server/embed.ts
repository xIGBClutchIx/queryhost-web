import type { BadgeTheme } from "../lib/badge-url.js";
import { BADGE_THEMES } from "../lib/badge-url.js";
import type { PlaygroundQueryInput } from "../lib/playground-contracts.js";
import { PLAYGROUND_GAMES } from "../lib/playground-games.js";
import { resultPath } from "../lib/result-url.js";
import { displayServerText } from "../lib/server-text.js";
import {
  gameLabel,
  parseImageRequest,
  validatedResponse,
  type BadgeService,
} from "./badge.js";
import type { BadgeState } from "./badge-svg.js";
import { callerAddress, rateLimitIdentity } from "./client-address.js";
import { escapeMarkup } from "./http-shared.js";
import { PublicQueryInputError } from "./public-query.js";

const EMBED_ROUTE_ALLOW = "GET, HEAD, OPTIONS";
/** The card reloads itself this often; it ships no script. */
const REFRESH_SECONDS = 60;
const MAX_NAME_LENGTH = 80;
const COUNT_FORMAT = new Intl.NumberFormat("en-US");
const CONTROL_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/**
 * The card is the one page other sites may frame. It loads nothing: styles
 * are inline and the only image is a validated data URL.
 */
export const EMBED_CONTENT_SECURITY_POLICY =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors *; img-src data:; style-src 'unsafe-inline'";

/** What one status card shows. */
export interface EmbedCard {
  readonly address: string;
  readonly gameName: string;
  /** A same-origin result page path. */
  readonly href: string;
  readonly state: BadgeState;
  readonly theme: BadgeTheme;
  readonly serverName?: string;
}

function cardAddress(input: PlaygroundQueryInput): string {
  const host = input.host.includes(":") ? `[${input.host}]` : input.host;
  return input.port === undefined ? host : `${host}:${input.port}`;
}

function cardServerName(game: string, state: BadgeState): string | undefined {
  if (state.kind !== "online" || state.name === undefined) {
    return undefined;
  }
  const name = displayServerText(game, state.name)
    .replace(CONTROL_CHARACTERS, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (name.length === 0) {
    return undefined;
  }
  const characters = Array.from(name);
  return characters.length > MAX_NAME_LENGTH
    ? `${characters.slice(0, MAX_NAME_LENGTH - 1).join("")}…`
    : name;
}

/** The card for a parsed query and its resolved state. */
export function embedCard(
  input: PlaygroundQueryInput,
  state: BadgeState,
  theme: BadgeTheme,
): EmbedCard {
  const game = PLAYGROUND_GAMES.find(
    (definition) => definition.id === input.game,
  );
  const serverName = cardServerName(input.game, state);
  return {
    address: cardAddress(input),
    gameName: game?.name ?? gameLabel(input.game),
    href: resultPath(
      {
        game: input.game,
        host: input.host,
        ...(input.port === undefined ? {} : { port: input.port }),
        ...(input.queryPort === undefined
          ? {}
          : { queryPort: input.queryPort }),
      },
      game,
    ),
    state,
    theme,
    ...(serverName === undefined ? {} : { serverName }),
  };
}

function statusText(state: BadgeState): {
  readonly label: string;
  readonly players?: string;
  readonly tone: "online" | "partial" | "muted";
} {
  switch (state.kind) {
    case "online": {
      const tone = state.partial ? "partial" : "online";
      if (state.online === undefined) {
        return { label: "Online", tone };
      }
      const online = COUNT_FORMAT.format(state.online);
      return {
        label: "Online",
        players:
          state.max === undefined
            ? `${online} playing`
            : `${online}/${COUNT_FORMAT.format(state.max)}`,
        tone,
      };
    }
    case "offline":
      return { label: "Offline", tone: "muted" };
    case "unavailable":
      return { label: "Unavailable", tone: "muted" };
    case "invalid":
      return { label: "Invalid server", tone: "muted" };
  }
}

// The site's dark palette (src/styles/base.css) and a light counterpart whose
// status colours keep 4.5:1 text contrast on white.
const DARK_VARIABLES =
  "--bg:#10191d;--border:#253539;--text:#eef5f3;--muted:#9fb3ae;--online:#55d7ba;--partial:#e2a95f;--off:#7d9096;--focus:#55d7ba";
const LIGHT_VARIABLES =
  "--bg:#ffffff;--border:#cfdcd8;--text:#10191d;--muted:#4c5f5b;--online:#137a63;--partial:#8f5614;--off:#5d6e73;--focus:#137a63";

function themeStyle(theme: BadgeTheme): string {
  switch (theme) {
    case "dark":
      return `:root{color-scheme:dark;${DARK_VARIABLES}}`;
    case "light":
      return `:root{color-scheme:light;${LIGHT_VARIABLES}}`;
    case "auto":
      return `:root{color-scheme:light dark;${DARK_VARIABLES}}@media (prefers-color-scheme:light){:root{${LIGHT_VARIABLES}}}`;
  }
}

const CARD_STYLE =
  "*{box-sizing:border-box}html,body{margin:0;height:100%;background:transparent}" +
  "body{font:14px/1.3 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}" +
  ".card{display:flex;align-items:center;gap:12px;width:100%;max-width:360px;height:88px;padding:12px 14px;border:1px solid var(--border);border-radius:10px;background:var(--bg);color:var(--text);text-decoration:none;overflow:hidden}" +
  ".card:hover{border-color:var(--muted)}.card:focus-visible{outline:2px solid var(--focus);outline-offset:-3px}" +
  ".icon{flex:none;width:48px;height:48px;border-radius:8px;image-rendering:pixelated}" +
  ".glyph{display:grid;place-items:center;background:var(--border);color:var(--muted);font-weight:700;font-size:20px}" +
  ".text{flex:1;min-width:0;display:grid;gap:2px}" +
  ".name,.address{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}" +
  ".name{font-weight:600;font-size:15px}.address{color:var(--muted);font-size:12px}" +
  ".status{flex:none;display:grid;justify-items:end;gap:2px;text-align:right}" +
  ".state{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted)}" +
  ".dot{width:8px;height:8px;border-radius:50%;background:var(--off)}" +
  ".online .dot{background:var(--online)}.partial .dot{background:var(--partial)}" +
  ".players{font-weight:600;font-variant-numeric:tabular-nums}";

/** Renders a status card page: no script, no external resources. */
export function renderEmbedHtml(card: EmbedCard): string {
  const status = statusText(card.state);
  const title = card.serverName ?? card.address;
  const detail =
    card.serverName === undefined
      ? card.gameName
      : `${card.address} · ${card.gameName}`;
  const favicon = card.state.kind === "online" ? card.state.favicon : undefined;
  const icon =
    favicon === undefined
      ? `<span class="icon glyph" aria-hidden="true">${escapeMarkup(Array.from(card.gameName)[0] ?? "Q")}</span>`
      : `<img class="icon" src="${escapeMarkup(favicon)}" alt="" width="48" height="48">`;
  const players =
    status.players === undefined
      ? ""
      : `<span class="players">${escapeMarkup(status.players)}</span>`;
  const label = `${title}, ${card.gameName}: ${status.label}${status.players === undefined ? "" : `, ${status.players} players`}. Opens on QueryHost.`;
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="robots" content="noindex">`,
    `<meta http-equiv="refresh" content="${REFRESH_SECONDS}">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeMarkup(`${title} · ${card.gameName} · QueryHost`)}</title>`,
    `<style>${themeStyle(card.theme)}${CARD_STYLE}</style></head><body>`,
    `<a class="card ${status.tone}" href="${escapeMarkup(card.href)}" target="_blank" rel="noopener" aria-label="${escapeMarkup(label)}">`,
    icon,
    `<span class="text"><span class="name">${escapeMarkup(title)}</span><span class="address">${escapeMarkup(detail)}</span></span>`,
    `<span class="status">${players}<span class="state"><span class="dot"></span>${escapeMarkup(status.label)}</span></span>`,
    `</a></body></html>`,
  ].join("");
}

function embedTheme(search: URLSearchParams): BadgeTheme {
  const raw = search.get("theme");
  return BADGE_THEMES.find((theme) => theme === raw) ?? "dark";
}

function embedResponse(
  request: Request,
  card: EmbedCard,
  status: number,
  maxAgeSeconds: number,
): Response {
  return validatedResponse(request, renderEmbedHtml(card), status, {
    "Cache-Control": `public, max-age=${maxAgeSeconds}`,
    "Content-Security-Policy": EMBED_CONTENT_SECURITY_POLICY,
    "Content-Type": "text/html; charset=utf-8",
    "X-Robots-Tag": "noindex",
  });
}

function embedRouteError(status: 404 | 405, message: string): Response {
  return new Response(message, {
    headers: {
      Allow: EMBED_ROUTE_ALLOW,
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Robots-Tag": "noindex",
    },
    status,
  });
}

/**
 * Handles `/embed/{game}/{host}[:{port}]`, a framable status card resolved
 * through the badge cache, so it spends no query budget a badge would not.
 */
export async function handleEmbedRequest(
  request: Request,
  params: { readonly game: string; readonly target: string },
  service: BadgeService,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: { Allow: EMBED_ROUTE_ALLOW, "Cache-Control": "no-store" },
      status: 204,
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return embedRouteError(405, `This route allows ${EMBED_ROUTE_ALLOW}.`);
  }
  const search = new URL(request.url).searchParams;
  const theme = embedTheme(search);
  let input: PlaygroundQueryInput | undefined;
  try {
    input = parseImageRequest(params.game, params.target, "", search);
  } catch (error) {
    if (!(error instanceof PublicQueryInputError)) throw error;
  }
  if (input === undefined) {
    if (params.target.length === 0) {
      return embedRouteError(
        404,
        "Embed paths look like /embed/{game}/{host}.",
      );
    }
    // The path is not echoed: this page may be framed anywhere.
    const invalid: EmbedCard = {
      address: "Unknown server",
      gameName: "QueryHost",
      href: "/",
      state: { kind: "invalid" },
      theme,
    };
    return embedResponse(request, invalid, 400, 300);
  }
  const { maxAgeSeconds, state } = await service.resolve(
    input,
    rateLimitIdentity(callerAddress(request)),
  );
  return embedResponse(
    request,
    embedCard(input, state, theme),
    200,
    maxAgeSeconds,
  );
}
