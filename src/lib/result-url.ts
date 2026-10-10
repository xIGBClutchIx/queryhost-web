import type {
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "./playground-contracts.js";

/** The parts of a `{host}[:{port}]` path segment, before validation. */
export interface TargetParts {
  readonly host: string;
  readonly port?: string;
}

/**
 * The `{host}[:{port}]` path segment shared by result pages, preview images,
 * and badges. IPv6 literals are bracketed so their colons are not read as a port.
 */
export function targetSegment(host: string, port?: number): string {
  const name = host.includes(":") ? `[${host}]` : encodeURIComponent(host);
  return port === undefined ? name : `${name}:${port}`;
}

/**
 * Splits `host`, `host:port`, `[ipv6]`, or `[ipv6]:port`. A bare IPv6 literal
 * has several colons and is taken whole, without a port.
 */
export function splitTarget(target: string): TargetParts {
  const bracketed = /^\[([^\]]+)\](?::([^:]*))?$/u.exec(target);
  if (bracketed !== null) {
    const [, host = "", port] = bracketed;
    return port === undefined ? { host } : { host, port };
  }
  const colon = target.indexOf(":");
  if (colon !== -1 && colon === target.lastIndexOf(":")) {
    return { host: target.slice(0, colon), port: target.slice(colon + 1) };
  }
  return { host: target };
}

/**
 * The shareable result path, as in `/rust/play.example.com`. Values the
 * playground fills in by itself (the default port, mode, and timeout) are
 * omitted, so opening the link rebuilds exactly this input.
 */
export function resultPath(
  input: PlaygroundQueryInput,
  game: PlaygroundGameDefinition | undefined,
): string {
  const port =
    input.port === undefined || input.port === game?.defaultPort
      ? undefined
      : input.port;
  const parameters = new URLSearchParams();
  if (input.queryPort !== undefined) {
    parameters.set("queryPort", String(input.queryPort));
  }
  if (input.mode !== undefined && input.mode !== game?.defaultMode) {
    parameters.set("mode", input.mode);
  }
  if (input.timeoutMs !== undefined && input.timeoutMs !== 5_000) {
    parameters.set("timeoutMs", String(input.timeoutMs));
  }
  const search = parameters.size === 0 ? "" : `?${parameters.toString()}`;
  return `/${input.game}/${targetSegment(input.host, port)}${search}`;
}

/**
 * Rewrites a result path's target and options into the playground's form
 * parameters, which the form already knows how to restore and validate.
 */
export function resultFormSearch(
  game: string,
  target: TargetParts,
  search: URLSearchParams,
): string {
  const parameters = new URLSearchParams();
  parameters.set("game", game);
  parameters.set("host", target.host);
  if (target.port !== undefined) parameters.set("port", target.port);
  for (const key of ["queryPort", "mode", "timeoutMs"] as const) {
    const value = search.get(key);
    if (value !== null) parameters.set(key, value);
  }
  return `?${parameters.toString()}`;
}

/** The PNG link preview for a result, mirroring the result path's target. */
export function previewImagePath(
  input: PlaygroundQueryInput,
  game: PlaygroundGameDefinition | undefined,
): string {
  const path = resultPath(
    { game: input.game, host: input.host, ...portFields(input) },
    game,
  );
  const [pathname = "", search = ""] = path.split("?", 2);
  return `/preview${pathname}.png${search.length === 0 ? "" : `?${search}`}`;
}

function portFields(
  input: PlaygroundQueryInput,
): Pick<PlaygroundQueryInput, "port" | "queryPort"> {
  return {
    ...(input.port === undefined ? {} : { port: input.port }),
    ...(input.queryPort === undefined ? {} : { queryPort: input.queryPort }),
  };
}
