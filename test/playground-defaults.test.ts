import { describe, expect, it } from "vitest";

import { defaultQueryMode } from "../src/lib/playground-defaults.js";
import { GAMES } from "../src/lib/queryhost.js";

describe("playground query defaults", () => {
  it("uses summary mode for Minecraft: Java Edition only", () => {
    for (const game of GAMES) {
      expect(defaultQueryMode(game.id)).toBe(
        game.id === "minecraft-java" ? "summary" : "full",
      );
    }
  });
});
