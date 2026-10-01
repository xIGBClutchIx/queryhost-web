import { describe, expect, it } from "vitest";
import { Script } from "node:vm";
import {
  workspaceHtml,
  workspaceMetadata,
} from "../src/server/mcp-workspace-resource.js";
import {
  FULL_RESULT_KEY,
  FULL_RESULT_LIMIT,
} from "../src/lib/mcp-workspace-contract.js";
import { compactMcpOutput } from "../src/server/mcp-projection.js";
import type { JsonObject } from "../src/lib/playground-contracts.js";

describe("workspace UI payload", () => {
  it("preserves detail arrays and raw data independently of the model budget", () => {
    const output: JsonObject = {
      input: { game: "minecraft-java", host: "example.com" },
      summary: "Query succeeded",
      playgroundUrl: "https://query.host/",
      result: {
        ok: true,
        server: { players: { online: 0 } },
        data: {
          players: Array.from({ length: 100 }, (_, index) => ({
            name: `Player ${index}`,
          })),
          favicon: "binary",
        },
        rawData: { rules: ["test"], favicon: "binary" },
        sources: [],
        warnings: [],
      },
    };
    const metadata = workspaceMetadata(output);
    expect(JSON.stringify(metadata)).toContain("Player 99");
    expect(JSON.stringify(metadata)).toContain('"rawData"');
    expect(JSON.stringify(metadata)).not.toContain("favicon");
    expect(
      Buffer.byteLength(JSON.stringify(compactMcpOutput(output))),
    ).toBeLessThanOrEqual(16384);
    expect(JSON.stringify(compactMcpOutput(output))).not.toContain("Player 99");
  });
  it("falls back explicitly when details exceed the UI budget and bounds nesting", () => {
    expect(workspaceMetadata({ data: "x".repeat(FULL_RESULT_LIMIT) })).toEqual({
      "queryhost/detailLimited": true,
    });
    let nested: JsonObject = {};
    for (let depth = 0; depth < 40; depth++) nested = { nested };
    expect(workspaceMetadata(nested)["queryhost/detailLimited"]).toBe(true);
    expect(
      workspaceMetadata({ zero: 0, empty: [], false: false })[FULL_RESULT_KEY],
    ).toEqual({ zero: 0, empty: [], false: false });
  });
  it("bundles the official bridge without external assets or fetches", () => {
    const script = workspaceHtml.slice(
      workspaceHtml.indexOf("<script>") + 8,
      workspaceHtml.lastIndexOf("</script>"),
    );
    expect(() => new Script(script)).not.toThrow();
    expect(workspaceHtml).toContain("ui/initialize");
    expect(workspaceHtml).toContain("Query a server");
    expect(workspaceHtml).not.toMatch(/<script[^>]+src=|<link[^>]+href=/u);
  });
});
