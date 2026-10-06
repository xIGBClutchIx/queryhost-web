import { createHighlighterCoreSync } from "shiki/core";
import type { HighlighterCore, SpecialLanguage } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";
import css from "shiki/langs/css.mjs";
import html from "shiki/langs/html.mjs";
import javascript from "shiki/langs/javascript.mjs";
import json from "shiki/langs/json.mjs";
import shellscript from "shiki/langs/shellscript.mjs";
import typescript from "shiki/langs/typescript.mjs";
import githubDark from "shiki/themes/github-dark.mjs";

type HighlightLanguage =
  | "css"
  | "html"
  | "javascript"
  | "json"
  | "shellscript"
  | "typescript"
  | SpecialLanguage;

const LANGUAGE_ALIASES: Readonly<Record<string, HighlightLanguage>> = {
  bash: "shellscript",
  css: "css",
  html: "html",
  javascript: "javascript",
  js: "javascript",
  json: "json",
  shell: "shellscript",
  sh: "shellscript",
  text: "text",
  ts: "typescript",
  typescript: "typescript",
} as const;

let highlighter: HighlighterCore | undefined;

/**
 * Creates the highlighter on first use. The JavaScript regex engine builds it
 * synchronously, so importing this module costs nothing and needs no top-level await.
 */
function getHighlighter(): HighlighterCore {
  highlighter ??= createHighlighterCoreSync({
    engine: createJavaScriptRegexEngine(),
    langs: [typescript, javascript, json, shellscript, html, css],
    themes: [githubDark],
  });
  return highlighter;
}

function highlightLanguage(language: string): HighlightLanguage {
  return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? "text";
}

/** Render trusted documentation source as escaped, token-highlighted HTML. */
export function highlightCode(code: string, language: string): string {
  return getHighlighter().codeToHtml(code, {
    lang: highlightLanguage(language),
    theme: "github-dark",
  });
}
