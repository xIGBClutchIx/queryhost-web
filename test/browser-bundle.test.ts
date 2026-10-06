import { build } from "esbuild";
import { describe, expect, it } from "vitest";

describe("browser bundle", () => {
  it("bundles the playground game list without Node.js modules", async () => {
    const result = await build({
      bundle: true,
      entryPoints: [
        new URL("../src/lib/playground-games.ts", import.meta.url).pathname,
      ],
      format: "esm",
      logLevel: "silent",
      platform: "browser",
      write: false,
    });
    const output = result.outputFiles.map((file) => file.text).join("\n");
    expect(output).toContain("minecraft-java");
    expect(output).not.toMatch(/\bnode:/u);
  });
});
