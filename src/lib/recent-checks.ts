import type { GameId } from "queryhost";

import type {
  JsonValue,
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "./playground-contracts.js";

/**
 * One server this browser checked. Only the address is kept: never results,
 * names, or players. The list lives in the visitor's own localStorage and is
 * never sent to QueryHost.
 */
export interface RecentCheck {
  readonly game: GameId;
  readonly host: string;
  readonly port?: number;
  readonly queryPort?: number;
}

export const RECENT_CHECKS_KEY = "queryhost:recent-checks";
export const RECENT_CHECKS_LIMIT = 6;

function isPort(value: JsonValue | undefined): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 65_535
  );
}

/** The same plain-host rule the form applies before it queries. */
function isPlainHost(value: JsonValue | undefined): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 253 &&
    !/[\s/?#@[\]%]/u.test(value)
  );
}

/**
 * One spelling per server: hostnames are case-insensitive, a fully qualified
 * name's trailing dot names the same host, and the game's default port is the
 * port a check without one reaches.
 */
function normalizedCheck(
  check: RecentCheck,
  game: PlaygroundGameDefinition | undefined,
): RecentCheck {
  const host = check.host.toLowerCase().replace(/\.$/u, "");
  const port =
    check.port === undefined || check.port === game?.defaultPort
      ? undefined
      : check.port;
  return {
    game: check.game,
    host,
    ...(port === undefined ? {} : { port }),
    ...(check.queryPort === undefined ? {} : { queryPort: check.queryPort }),
  };
}

function recentCheck(
  value: JsonValue,
  games: readonly PlaygroundGameDefinition[],
): RecentCheck | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const game = games.find((candidate) => candidate.id === value["game"]);
  const { host, port, queryPort } = value;
  if (
    game === undefined ||
    !isPlainHost(host) ||
    (port !== undefined && !isPort(port)) ||
    (queryPort !== undefined && !isPort(queryPort))
  ) {
    return undefined;
  }
  const check = normalizedCheck(
    {
      game: game.id,
      host,
      ...(port === undefined ? {} : { port }),
      ...(queryPort === undefined ? {} : { queryPort }),
    },
    game,
  );
  return check.host.length === 0 ? undefined : check;
}

/** Reads the stored list, dropping anything malformed or for an unknown game. */
export function parseRecentChecks(
  text: string | null,
  games: readonly PlaygroundGameDefinition[],
): readonly RecentCheck[] {
  if (text === null) return [];
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  // Lists saved before normalization can hold two spellings of one server.
  const checks: RecentCheck[] = [];
  for (const entry of value) {
    const check = recentCheck(entry, games);
    if (
      check !== undefined &&
      !checks.some((existing) => sameServer(existing, check))
    ) {
      checks.push(check);
    }
  }
  return checks.slice(0, RECENT_CHECKS_LIMIT);
}

/** Compares normalized checks. */
export function sameServer(left: RecentCheck, right: RecentCheck): boolean {
  return (
    left.game === right.game &&
    left.host === right.host &&
    left.port === right.port &&
    left.queryPort === right.queryPort
  );
}

/** Moves a check to the front, without duplicates and within the limit. */
export function withRecentCheck(
  checks: readonly RecentCheck[],
  input: PlaygroundQueryInput,
  games: readonly PlaygroundGameDefinition[],
): readonly RecentCheck[] {
  const check = normalizedCheck(
    {
      game: input.game,
      host: input.host,
      ...(input.port === undefined ? {} : { port: input.port }),
      ...(input.queryPort === undefined ? {} : { queryPort: input.queryPort }),
    },
    games.find((candidate) => candidate.id === input.game),
  );
  return [
    check,
    ...checks.filter((existing) => !sameServer(existing, check)),
  ].slice(0, RECENT_CHECKS_LIMIT);
}

/** Drops one check, as from its remove control. */
export function withoutRecentCheck(
  checks: readonly RecentCheck[],
  check: RecentCheck,
): readonly RecentCheck[] {
  return checks.filter((existing) => !sameServer(existing, check));
}

/** Storage can be missing or refuse access, as in some private windows. */
function storage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const listeners = new Set<() => void>();

/** The stored list's raw text; `null` on the server or without storage. */
export function recentChecksSnapshot(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return storage()?.getItem(RECENT_CHECKS_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Notifies on this page's changes and on changes made in other tabs. */
export function subscribeRecentChecks(listener: () => void): () => void {
  function onStorage(event: StorageEvent): void {
    if (event.key === null || event.key === RECENT_CHECKS_KEY) listener();
  }
  listeners.add(listener);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Tells subscribers to read the list again, as when a page finishes hydrating. */
export function notifyRecentChecks(): void {
  for (const listener of listeners) listener();
}

export function saveRecentChecks(checks: readonly RecentCheck[]): void {
  try {
    if (checks.length === 0) storage()?.removeItem(RECENT_CHECKS_KEY);
    else storage()?.setItem(RECENT_CHECKS_KEY, JSON.stringify(checks));
  } catch {
    // A full or blocked storage only loses the convenience list.
  }
  notifyRecentChecks();
}
