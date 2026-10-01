import { GAMES } from "./queryhost.js";
import { defaultQueryMode } from "./playground-defaults.js";
import type { PlaygroundGameDefinition } from "./playground-contracts.js";

/** One registry projection for the human playground and both agent integrations. */
export const PLAYGROUND_GAMES: readonly PlaygroundGameDefinition[] = GAMES.map(
  (game) => ({
    capabilities: game.capabilities,
    defaultMode: defaultQueryMode(game.id),
    ...(game.defaultPort === undefined
      ? {}
      : { defaultPort: game.defaultPort }),
    ...(game.defaultQueryPort === undefined
      ? {}
      : { defaultQueryPort: game.defaultQueryPort }),
    ...(game.queryPortStrategy === undefined
      ? {}
      : { queryPortStrategy: game.queryPortStrategy }),
    id: game.id,
    name: game.name,
  }),
).toSorted((left, right) => left.name.localeCompare(right.name, "en"));
