import type { PlaygroundQueryInput } from "./playground-contracts.js";

/** A well-known public server the homepage offers as a one-click first query. */
export interface PlaygroundExample {
  readonly input: PlaygroundQueryInput;
  readonly label: string;
}

// Large networks that have kept the same public hostname for years. A server that goes
// away only produces a normal failed result, so this list needs no runtime check.
export const PLAYGROUND_EXAMPLES: readonly PlaygroundExample[] = [
  {
    input: { game: "minecraft-java", host: "mc.hypixel.net" },
    label: "Minecraft Java",
  },
  {
    input: { game: "minecraft-bedrock", host: "play.cubecraft.net" },
    label: "Minecraft Bedrock",
  },
];
