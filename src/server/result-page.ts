import { canonicalGameId, isGameInputId } from "queryhost/registry";

import type {
  JsonObject,
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "../lib/playground-contracts.js";
import {
  findGame,
  formQueryInput,
  formStateFromSearch,
  initialFormState,
  isCompleteSharedQuery,
} from "../lib/playground-form.js";
import {
  previewImagePath,
  resultPath,
  resultFormSearch,
  splitTarget,
} from "../lib/result-url.js";
import { previewAddress } from "./preview.js";
import { parseQueryFields, PublicQueryInputError } from "./public-query.js";

const PORT_PATTERN = /^\d{1,5}$/u;

/** The metadata and prefilled form of one shareable result page. */
export interface ResultPage {
  readonly description: string;
  /** The page's link preview, a same-origin path. */
  readonly imagePath: string;
  readonly imageAlt: string;
  readonly kind: "page";
  /** The query in the playground's form-parameter shape. */
  readonly search: string;
  readonly title: string;
}

export type ResultPageResolution =
  | ResultPage
  | { readonly kind: "not-found" }
  | { readonly kind: "redirect"; readonly location: string };

function decodeSegment(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/**
 * Resolves `/{game}/{host}[:{port}]`. Game aliases redirect to the game's ID,
 * and anything that does not name a valid server is not a page.
 */
export function resolveResultPage(
  gameSegment: string,
  targetSegment: string,
  url: URL,
  games: readonly PlaygroundGameDefinition[],
): ResultPageResolution {
  if (!isGameInputId(gameSegment)) {
    return { kind: "not-found" };
  }
  const gameId = canonicalGameId(gameSegment);
  if (gameId !== gameSegment) {
    return {
      kind: "redirect",
      location: `/${gameId}/${targetSegment}${url.search}`,
    };
  }
  const game = findGame(games, gameId);
  const target = decodeSegment(targetSegment);
  if (game === undefined || target === undefined) {
    return { kind: "not-found" };
  }

  const { host, port } = splitTarget(target);
  const queryPort = url.searchParams.get("queryPort");
  let input: PlaygroundQueryInput;
  try {
    const fields: JsonObject = {
      game: gameId,
      host,
      ...(port === undefined
        ? game.defaultPort === undefined
          ? {}
          : { port: game.defaultPort }
        : { port: PORT_PATTERN.test(port) ? Number(port) : port }),
      ...(queryPort === null
        ? {}
        : {
            queryPort: PORT_PATTERN.test(queryPort)
              ? Number(queryPort)
              : queryPort,
          }),
    };
    input = parseQueryFields(fields);
  } catch (error) {
    if (error instanceof PublicQueryInputError) {
      return { kind: "not-found" };
    }
    throw error;
  }

  // The address reads like the link: a port the path left out stays out.
  const address = previewAddress(
    port === undefined ? { game: input.game, host: input.host } : input,
  );
  return {
    description: `Live status of the ${game.name} server at ${address}, checked by QueryHost.`,
    imageAlt: `${game.name} server ${address}: its live status on QueryHost.`,
    imagePath: previewImagePath(input, game),
    kind: "page",
    search: resultFormSearch(
      gameId,
      port === undefined ? { host } : { host, port },
      url.searchParams,
    ),
    title: `${address} · ${game.name}`,
  };
}

/**
 * Complete query-string links (`/?game=&host=`) move to their result page, so
 * every query has one shareable URL. Incomplete ones stay prefilled on `/`.
 */
export function legacyResultLocation(
  search: string,
  games: readonly PlaygroundGameDefinition[],
): string | undefined {
  if (!isCompleteSharedQuery(search, games)) {
    return undefined;
  }
  const parsed = formQueryInput(
    formStateFromSearch(search, games, initialFormState(games)),
  );
  return parsed.kind === "valid"
    ? resultPath(parsed.input, findGame(games, parsed.input.game))
    : undefined;
}
