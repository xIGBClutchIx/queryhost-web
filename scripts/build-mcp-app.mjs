import { build } from "esbuild";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const result = await build({
  entryPoints: ["src/lib/mcp-workspace-entry.ts"],
  bundle: true,
  write: false,
  platform: "browser",
  format: "iife",
  target: "es2022",
  minify: true,
  legalComments: "none",
});
const script = result.outputFiles[0].text.replaceAll("</script", "<\\/script");
const template = await readFile("src/lib/mcp-workspace.html", "utf8");
const native = await readFile(
  new URL(import.meta.resolve("@openai/mcp-extensions/app/styles.css")),
  "utf8",
);
const styles = await readFile("src/lib/mcp-workspace.css", "utf8");
await mkdir("src/generated", { recursive: true });
await writeFile(
  "src/generated/queryhost-app.html",
  template
    .replace("<!-- STYLES -->", () => `<style>${native}\n${styles}</style>`)
    .replace("<!-- SCRIPT -->", () => `<script>${script}</script>`),
);
