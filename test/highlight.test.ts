import { codeToHtml } from "shiki";
import { describe, expect, it } from "vitest";

import { highlightCode } from "../src/lib/highlight.js";

const SAMPLES: readonly (readonly [string, string])[] = [
  [
    "typescript",
    'import { queryGameServer } from "queryhost";\n\nconst result = await queryGameServer({ game: "rust", host: "play.example.com", port: 28015 });\nif (result.ok) console.log(`${result.server.players?.online ?? 0} online`);',
  ],
  ["js", "export default { timeoutMs: 5_000 } satisfies object;"],
  ["json", '{ "ok": false, "error": { "code": "TIMEOUT", "port": 25565 } }'],
  [
    "shell",
    "npm install queryhost\nnpx queryhost rust play.example.com:28015 --json | jq '.server'",
  ],
  ["html", '<a class="button" href="/docs/">Docs</a>'],
  ["css", ".code-block { color: var(--code-text); margin: 0 auto; }"],
];

describe("highlightCode", () => {
  it("matches the full Oniguruma highlighter for every documented language", async () => {
    for (const [language, code] of SAMPLES) {
      const lang =
        language === "js"
          ? "javascript"
          : language === "shell"
            ? "shellscript"
            : language;
      expect(highlightCode(code, language)).toBe(
        await codeToHtml(code, { lang, theme: "github-dark" }),
      );
    }
  });

  it("falls back to plain text for unknown languages", () => {
    expect(highlightCode("<b>", "brainfuck")).toContain("&#x3C;b>");
  });
});
