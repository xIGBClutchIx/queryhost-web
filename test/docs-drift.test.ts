import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MCP_CARD_URI } from "../src/server/mcp-card-resource.js";
import { WORKSPACE_URI } from "../src/lib/mcp-workspace-contract.js";

const root = join(import.meta.dirname, "..");

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return Promise.resolve(entry.name.endsWith(".ts") ? [path] : []);
    }),
  );
  return nested.flat();
}

describe("operator documentation", () => {
  it("names the MCP resource URIs the server registers", async () => {
    const mcp = await readFile(join(root, "docs", "MCP.md"), "utf8");
    expect(mcp).toContain(MCP_CARD_URI);
    expect(mcp).toContain(WORKSPACE_URI);
  });

  it("lists every environment variable the server reads", async () => {
    const operations = await readFile(
      join(root, "docs", "Operations.md"),
      "utf8",
    );
    const names = new Set<string>();
    for (const file of await sourceFiles(join(root, "src", "server"))) {
      const source = await readFile(file, "utf8");
      // Gate prefixes end in `_` and are documented as a suffix table.
      for (const match of source.matchAll(/"(QUERYHOST_[A-Z_]*[A-Z])"/gu)) {
        const name = match[1];
        if (name !== undefined) names.add(name);
      }
    }
    expect(names.size).toBeGreaterThan(0);
    const missing = [...names].filter(
      (name) => !operations.includes(`\`${name}\``),
    );
    expect(missing).toEqual([]);
  });
});
