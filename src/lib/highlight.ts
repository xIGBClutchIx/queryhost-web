import {
  createHighlighter,
  type BundledLanguage,
  type SpecialLanguage,
} from "shiki";

type HighlightLanguage = BundledLanguage | SpecialLanguage;

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

const highlighter = await createHighlighter({
  langs: ["typescript", "javascript", "json", "shellscript", "html", "css"],
  themes: ["github-light", "github-dark"],
});

function highlightLanguage(language: string): HighlightLanguage {
  return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? "text";
}

/** Render trusted documentation source as escaped, token-highlighted HTML. */
export function highlightCode(code: string, language: string): string {
  return highlighter.codeToHtml(code, {
    defaultColor: false,
    lang: highlightLanguage(language),
    themes: {
      dark: "github-dark",
      light: "github-light",
    },
  });
}
