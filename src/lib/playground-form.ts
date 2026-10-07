import type { GameId, QueryMode } from "queryhost";

import type {
  HostedCacheMetadata,
  JsonObject,
  JsonValue,
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "./playground-contracts.js";
import { defaultQueryMode } from "./playground-defaults.js";

export type PlaygroundTimeout = "3000" | "5000";

/** Every playground control as the browser edits it; ports stay text until submission. */
export interface PlaygroundFormState {
  readonly advancedOpen: boolean;
  readonly game: GameId;
  readonly host: string;
  readonly mode: QueryMode;
  readonly port: string;
  readonly queryPort: string;
  readonly timeoutMs: PlaygroundTimeout;
}

/** How the port controls present the selected game profile. */
export interface PlaygroundGameFields {
  readonly portLabel: string;
  readonly portRequired: boolean;
  readonly queryPortAvailable: boolean;
  readonly queryPortHelp: string;
  readonly queryPortPlaceholder: string;
}

export const DEFAULT_PLAYGROUND_GAME: GameId = "minecraft-java";

const PORT_PARAMETER = /^\d{1,5}$/u;

export function findGame(
  games: readonly PlaygroundGameDefinition[],
  id: string,
): PlaygroundGameDefinition | undefined {
  return games.find((candidate) => candidate.id === id);
}

function portText(port: number | undefined): string {
  return port === undefined ? "" : String(port);
}

/** Generic A2S takes the query destination as its only port. */
export function gameFields(
  game: PlaygroundGameDefinition,
): PlaygroundGameFields {
  const genericA2s = game.id === "a2s";
  return {
    portLabel: genericA2s ? "Query port" : "Game port",
    portRequired: genericA2s,
    queryPortAvailable: !genericA2s,
    queryPortHelp:
      game.defaultQueryPort === undefined
        ? "Uses the game port unless the profile discovers another target."
        : game.queryPortStrategy === "fixed"
          ? `Defaults to ${game.defaultQueryPort}; independent of the game port.`
          : `Defaults to ${game.defaultQueryPort}; custom game ports preserve the offset.`,
    queryPortPlaceholder:
      game.defaultQueryPort === undefined
        ? "Automatic"
        : String(game.defaultQueryPort),
  };
}

/** The form a fresh page renders on the server, before any share URL is read. */
export function initialFormState(
  games: readonly PlaygroundGameDefinition[],
): PlaygroundFormState {
  const game = findGame(games, DEFAULT_PLAYGROUND_GAME) ?? games[0];
  if (game === undefined) {
    throw new Error("The package registry exposes no playground games.");
  }
  return {
    advancedOpen: false,
    game: game.id,
    host: "",
    mode: defaultQueryMode(game.id),
    port: portText(game.defaultPort),
    queryPort: "",
    timeoutMs: "5000",
  };
}

/**
 * Switches profile while keeping a port the person typed. A port that still equals the
 * previous profile's default follows the new profile's default instead.
 */
export function selectGame(
  state: PlaygroundFormState,
  previous: PlaygroundGameDefinition | undefined,
  next: PlaygroundGameDefinition,
): PlaygroundFormState {
  const keepPort =
    state.port.length > 0 &&
    previous?.defaultPort !== undefined &&
    Number(state.port) !== previous.defaultPort;
  return {
    ...state,
    game: next.id,
    mode: defaultQueryMode(next.id),
    port: keepPort ? state.port : portText(next.defaultPort),
    queryPort: next.id === "a2s" ? "" : state.queryPort,
  };
}

/** Restores a shared playground link; unknown or malformed values keep their defaults. */
export function formStateFromSearch(
  search: string,
  games: readonly PlaygroundGameDefinition[],
  fallback: PlaygroundFormState,
): PlaygroundFormState {
  const parameters = new URLSearchParams(search);
  const game =
    findGame(games, parameters.get("game") ?? "") ??
    findGame(games, fallback.game);
  if (game === undefined) {
    return fallback;
  }

  const port = parameters.get("port");
  const queryPort = parameters.get("queryPort");
  const mode = parameters.get("mode");
  const timeout = parameters.get("timeoutMs");
  return {
    advancedOpen:
      parameters.has("queryPort") || mode === "summary" || timeout === "3000",
    game: game.id,
    host: parameters.get("host") ?? fallback.host,
    mode: mode === "summary" || mode === "full" ? mode : game.defaultMode,
    port:
      port !== null && PORT_PARAMETER.test(port)
        ? port
        : portText(game.defaultPort),
    queryPort:
      queryPort !== null && PORT_PARAMETER.test(queryPort) && game.id !== "a2s"
        ? queryPort
        : "",
    timeoutMs: timeout === "3000" || timeout === "5000" ? timeout : "5000",
  };
}

/**
 * A shared link names a complete query when it carries a known game and a host;
 * the playground runs such a link once when the page loads.
 */
export function isCompleteSharedQuery(
  search: string,
  games: readonly PlaygroundGameDefinition[],
): boolean {
  const parameters = new URLSearchParams(search);
  return (
    findGame(games, parameters.get("game") ?? "") !== undefined &&
    (parameters.get("host") ?? "").trim().length > 0
  );
}

/** Mirrors an agent-started query into the visible form. */
export function formStateFromQueryInput(
  input: PlaygroundQueryInput,
): PlaygroundFormState {
  const mode =
    input.mode === "full" || input.mode === "summary" ? input.mode : "summary";
  return {
    advancedOpen:
      input.queryPort !== undefined ||
      input.mode === "full" ||
      input.timeoutMs === 3_000,
    game: input.game,
    host: input.host,
    mode,
    port: portText(input.port),
    queryPort: input.game === "a2s" ? "" : portText(input.queryPort),
    timeoutMs: input.timeoutMs === 3_000 ? "3000" : "5000",
  };
}

function numericValue(value: string): number | undefined {
  if (value.length === 0) {
    return undefined;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : undefined;
}

export type FormQueryInputResult =
  | { readonly error: string; readonly kind: "invalid" }
  | { readonly input: PlaygroundQueryInput; readonly kind: "valid" };

/** Converts natively validated controls into the non-secret public query input. */
export function formQueryInput(
  state: PlaygroundFormState,
): FormQueryInputResult {
  const host = state.host.trim();
  if (
    /[\s/?#@]/u.test(host) ||
    host.includes("[") ||
    host.includes("]") ||
    host.includes("%")
  ) {
    return {
      error: "Enter a plain hostname or IP address without URL syntax.",
      kind: "invalid",
    };
  }
  const port = numericValue(state.port);
  const queryPort =
    state.game === "a2s" ? undefined : numericValue(state.queryPort);
  return {
    input: {
      game: state.game,
      host,
      ...(port === undefined ? {} : { port }),
      ...(queryPort === undefined ? {} : { queryPort }),
      mode: state.mode,
      timeoutMs: Number(state.timeoutMs),
    },
    kind: "valid",
  };
}

/** Builds the replaceable share URL; defaults are omitted to keep links short. */
export function shareUrl(
  currentHref: string,
  input: PlaygroundQueryInput,
): URL {
  const url = new URL(currentHref);
  url.search = "";
  url.searchParams.set("game", input.game);
  url.searchParams.set("host", input.host);
  if (input.port !== undefined) {
    url.searchParams.set("port", String(input.port));
  }
  if (input.queryPort !== undefined) {
    url.searchParams.set("queryPort", String(input.queryPort));
  }
  if (input.mode === "summary") {
    url.searchParams.set("mode", "summary");
  }
  if (input.timeoutMs !== undefined && input.timeoutMs !== 5_000) {
    url.searchParams.set("timeoutMs", String(input.timeoutMs));
  }
  return url;
}

export function milliseconds(value: number): string {
  return `${Math.round(value * 10) / 10} ms`;
}

export function readableKey(value: string): string {
  return value
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[._-]+/g, " ")
    .replace(/^./, (first) => first.toUpperCase());
}

/** Inline text for scalars; structured values render as formatted JSON instead. */
export function scalarText(value: JsonValue): string | undefined {
  if (value === null) {
    return "null";
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number" || typeof value === "string") {
    return String(value);
  }
  return undefined;
}

export function cacheLabel(cache: HostedCacheMetadata): string {
  return cache.status === "hit"
    ? `Cache hit · ${milliseconds(cache.ageMs)} old`
    : cache.status === "coalesced"
      ? "Shared in-flight query"
      : "Live query";
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonString(object: JsonObject, property: string): string | undefined {
  const value = object[property];
  return typeof value === "string" ? value : undefined;
}

/** Visual Minecraft identity; every field is independently optional. */
export interface MinecraftSummary {
  readonly favicon?: string;
  readonly motdHtml?: string;
  readonly motdPlain?: string;
}

function minecraftFavicon(data: JsonObject): string | undefined {
  const favicon = jsonString(data, "favicon");
  if (
    favicon === undefined ||
    favicon.length > 100_000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(favicon)
  ) {
    return undefined;
  }
  return favicon;
}

export function minecraftSummary(
  game: GameId,
  data: JsonObject,
): MinecraftSummary | undefined {
  if (game !== "minecraft-java" && game !== "minecraft-bedrock") {
    return undefined;
  }

  const motdValue = data.motd;
  const motdObject = isJsonObject(motdValue) ? motdValue : undefined;
  const motdPlain =
    typeof motdValue === "string"
      ? motdValue
      : motdObject === undefined
        ? undefined
        : jsonString(motdObject, "plain");
  const motdHtml =
    motdObject === undefined ? undefined : jsonString(motdObject, "html");
  const favicon =
    game === "minecraft-java" ? minecraftFavicon(data) : undefined;

  if (
    motdPlain === undefined &&
    motdHtml === undefined &&
    favicon === undefined
  ) {
    return undefined;
  }
  return {
    ...(favicon === undefined ? {} : { favicon }),
    ...(motdHtml === undefined ? {} : { motdHtml }),
    ...(motdPlain === undefined ? {} : { motdPlain }),
  };
}
