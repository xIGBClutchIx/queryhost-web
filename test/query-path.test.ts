import { describe, expect, it } from "vitest";

import {
  applySourceEvent,
  queryPathItems,
  sourceProgressItems,
} from "../src/lib/query-path.js";

describe("compact query path", () => {
  it("labels the new game's sources without losing source provenance", () => {
    expect(
      queryPathItems([
        { source: "redm-info", status: "ok" },
        { source: "redm-dynamic", status: "ok" },
        { source: "redm-players", status: "not-requested" },
        { source: "satisfactory-lightweight", status: "ok" },
        { source: "satisfactory-health", status: "timeout" },
        { source: "vintage-story-query", status: "ok" },
      ]).map(({ label }) => label),
    ).toEqual([
      "Server info",
      "Status",
      "Players",
      "Server state",
      "Health",
      "Server query",
    ]);
  });

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

  it("labels the Minecraft legacy ping fallback", () => {
    expect(
      queryPathItems([
        { source: "minecraft-slp", status: "malformed" },
        { source: "minecraft-legacy-ping", status: "ok", rttMs: 8 },
      ]).map(({ detail, label }) => ({ detail, label })),
    ).toEqual([
      { detail: "Malformed", label: "Status" },
      { detail: "8 ms", label: "Legacy ping" },
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

  it("folds running-query progress in first-seen order", () => {
    let progress = applySourceEvent([], {
      source: "a2s-info",
      type: "started",
    });
    progress = applySourceEvent(progress, {
      source: "a2s-player",
      type: "started",
    });
    progress = applySourceEvent(progress, {
      report: { rttMs: 31, source: "a2s-info", status: "ok" },
      type: "completed",
    });
    progress = applySourceEvent(progress, {
      report: { source: "a2s-rules", status: "not-requested" },
      type: "completed",
    });
    // A repeated start never undoes a completion.
    progress = applySourceEvent(progress, {
      source: "a2s-info",
      type: "started",
    });

    expect(sourceProgressItems(progress)).toEqual([
      { detail: "31 ms", label: "Info", source: "a2s-info", state: "ok" },
      {
        detail: "…",
        label: "Players",
        source: "a2s-player",
        state: "running",
      },
      {
        detail: "Skipped",
        label: "Rules",
        source: "a2s-rules",
        state: "not-requested",
      },
    ]);
  });
});
