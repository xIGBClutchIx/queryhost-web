import type { GameId, QueryMode } from "queryhost";

export function defaultQueryMode(game: GameId): QueryMode {
  return game === "minecraft-java" ? "summary" : "full";
}
