import { marked } from "marked";

const CHANGELOG_MODULES = import.meta.glob<string>(
  "../../node_modules/queryhost/CHANGELOG.md",
  { eager: true, import: "default", query: "?raw" },
);

const markdown = Object.values(CHANGELOG_MODULES)[0];
if (markdown === undefined) {
  throw new Error("The QueryHost package changelog is missing.");
}

const RELEASE_URL = "https://github.com/xIGBClutchIx/queryhost/releases/tag/v";

// A published changelog can omit a heading's link definition (1.4.2 did); derive the release URL so
// every version heading still links to its release.
function withReleaseLinks(source: string): string {
  const missing = Array.from(
    source.matchAll(/^## \[(\d+\.\d+\.\d+)\]/gm),
    (match) => match[1],
  )
    .filter((version) => version !== undefined)
    .filter((version) => !source.includes(`\n[${version}]: `));
  const definitions = missing.map(
    (version) => `[${version}]: ${RELEASE_URL}${version}`,
  );
  return definitions.length === 0
    ? source
    : `${source.trimEnd()}\n${definitions.join("\n")}\n`;
}

export const CHANGELOG_HTML = marked.parse(
  withReleaseLinks(markdown.replace(/^# Changelog[\s\S]*?(?=^## )/m, "")),
  { async: false },
);
