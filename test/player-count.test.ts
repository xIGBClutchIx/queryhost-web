import { describe, expect, it } from "vitest";

import { formatPlayerCount, playerFillRatio } from "../src/lib/player-count.js";

describe("player count", () => {
  it("groups large counts", () => {
    expect(formatPlayerCount({ online: 31_842, max: 200_000 })).toBe(
      "31,842 / 200,000",
    );
  });

  it("keeps unconfirmed counts distinct from zero", () => {
    expect(formatPlayerCount({ online: 0, max: 20 })).toBe("0 / 20");
    expect(formatPlayerCount({ max: 20 })).toBe("— / 20");
    expect(formatPlayerCount({ online: 4 })).toBe("4 / —");
  });

  it("only reports a fill ratio when both counts are confirmed", () => {
    expect(playerFillRatio({ online: 5, max: 20 })).toBe(0.25);
    expect(playerFillRatio({ online: 0, max: 20 })).toBe(0);
    expect(playerFillRatio({ online: 30, max: 20 })).toBe(1);
    expect(playerFillRatio({ max: 20 })).toBeUndefined();
    expect(playerFillRatio({ online: 3, max: 0 })).toBeUndefined();
  });
});
