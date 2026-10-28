import { marked, Renderer } from "marked";

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

/** The anchor of a release heading, as in `v1.8.0`, so each version can be linked and searched. */
export function changelogVersionId(version: string): string {
  return `v${version}`;
}

const renderer = new Renderer();
const renderHeading = renderer.heading.bind(renderer);
// Only release headings get ids; the repeated "Added" and "Fixed" headings beneath them would
// collide and add nothing to search or the contents list.
renderer.heading = function (token) {
  const version = /^\[?(\d+\.\d+\.\d+)\]?/.exec(token.text)?.[1];
  if (token.depth !== 2 || version === undefined) return renderHeading(token);
  return `<h2 id="${changelogVersionId(version)}">${this.parser.parseInline(token.tokens)}</h2>\n`;
};

export const CHANGELOG_HTML = marked.parse(
  withReleaseLinks(markdown.replace(/^# Changelog[\s\S]*?(?=^## )/m, "")),
  { async: false, renderer },
);
