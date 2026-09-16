import { marked } from "marked";

const CHANGELOG_MODULES = import.meta.glob<string>(
  "../../node_modules/queryhost/CHANGELOG.md",
  { eager: true, import: "default", query: "?raw" },
);

const markdown = Object.values(CHANGELOG_MODULES)[0];
if (markdown === undefined) {
  throw new Error("The QueryHost package changelog is missing.");
}

export const CHANGELOG_HTML = marked.parse(
  markdown.replace(/^# Changelog[\s\S]*?(?=^## )/m, ""),
  { async: false },
);
