import { describe, expect, it } from "vitest";

import { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
import { PREVIEW_GAMES } from "./fixtures/playground.js";

describe("playground fixtures", () => {
  it("copy the registry projection exactly", () => {
    for (const game of PREVIEW_GAMES) {
      expect(PLAYGROUND_GAMES.find(({ id }) => id === game.id)).toEqual(game);
    }
  });
});
