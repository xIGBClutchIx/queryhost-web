import {
  GAME_ALIASES,
  listGames,
  type GameCapability,
  type GameDefinition,
  type GameId,
  type SupportLevel,
} from "queryhost";

export const GAMES: readonly GameDefinition[] = listGames();

export const CAPABILITY_LABELS: Readonly<Record<GameCapability, string>> = {
  summary: "Summary",
  players: "Players",
  rules: "Rules",
  mods: "Mods",
  plugins: "Plugins",
  resources: "Resources",
  srv: "SRV discovery",
};

export const SUPPORT_LABELS: Readonly<Record<SupportLevel, string>> = {
  supported: "Supported",
  conditional: "Conditional",
  unsupported: "Unavailable",
};

export function aliasesForGame(game: GameId): readonly string[] {
  return Object.entries(GAME_ALIASES)
    .filter((entry) => entry[1] === game)
    .map((entry) => entry[0]);
}

export function capabilityEntries(
  game: GameDefinition,
): readonly (readonly [GameCapability, SupportLevel])[] {
  return Object.entries(game.capabilities) as readonly (readonly [
    GameCapability,
    SupportLevel,
  ])[];
}
