import { describe, expect, it } from "vitest";

import { queryPathItems } from "../src/lib/query-path.js";

describe("compact query path", () => {
  it("uses concise labels while preserving confirmed zero timings", () => {
    expect(
      queryPathItems([
        { source: "minecraft-srv", status: "unsupported" },
        { source: "minecraft-slp", status: "ok", rttMs: 0 },
        { source: "minecraft-query", status: "timeout" },
      ]),
    ).toEqual([
      {
        detail: "Unsupported",
        label: "SRV",
        source: "minecraft-srv",
        status: "unsupported",
      },
      {
        detail: "0 ms",
        label: "Status",
        source: "minecraft-slp",
        status: "ok",
      },
      {
        detail: "Timed out",
        label: "Query",
        source: "minecraft-query",
        status: "timeout",
      },
    ]);
  });

  it("keeps game-specific source names readable", () => {
    expect(
      queryPathItems([
        { source: "a2s-player", status: "not-requested" },
        { source: "fivem-info", status: "ok", rttMs: 12.34 },
        { source: "minecraft-bedrock-raknet", status: "blocked" },
      ]).map(({ detail, label }) => ({ detail, label })),
    ).toEqual([
      { detail: "Skipped", label: "Players" },
      { detail: "12.3 ms", label: "Server info" },
      { detail: "Blocked", label: "Bedrock ping" },
    ]);
  });
});
