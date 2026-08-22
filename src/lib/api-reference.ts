import { posix } from "node:path";

import { marked, Renderer } from "marked";

import { highlightCode } from "./highlight.js";

export interface ApiReferencePage {
  readonly category: string;
  readonly markdown: string;
  readonly slug: string;
  readonly title: string;
}

const MARKDOWN_MODULES = import.meta.glob<string>(
  "../../node_modules/queryhost/docs/api/**/*.md",
  {
    eager: true,
    import: "default",
    query: "?raw",
  },
);

function slugFromPath(pathname: string): string {
  const marker = "/docs/api/";
  const start = pathname.indexOf(marker);
  if (start === -1) {
    throw new Error("A packaged API reference path is outside docs/api.");
  }

  return pathname
    .slice(start + marker.length)
    .replace(/\.md$/, "")
    .replace(/\/README$/, "");
}

function titleFromMarkdown(markdown: string, slug: string): string {
  const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  if (heading !== undefined && heading.length > 0) {
    return heading.replaceAll("`", "");
  }

  const lastSegment = slug.split("/").at(-1);
  return lastSegment === undefined || lastSegment.length === 0
    ? "API reference"
    : lastSegment;
}

function categoryFromSlug(slug: string): string {
  const category = slug.split("/", 1)[0];
  return category === undefined || category.length === 0
    ? "Overview"
    : category;
}

export const API_REFERENCE_PAGES: readonly ApiReferencePage[] = Object.entries(
  MARKDOWN_MODULES,
)
  .map(([pathname, markdown]) => {
    const slug = slugFromPath(pathname);
    return {
      category: categoryFromSlug(slug),
      markdown,
      slug,
      title: titleFromMarkdown(markdown, slug),
    };
  })
  .sort((left, right) => left.slug.localeCompare(right.slug));

export function apiReferencePage(slug: string): ApiReferencePage | undefined {
  return API_REFERENCE_PAGES.find((page) => page.slug === slug);
}

export function apiReferenceLabel(title: string): string {
  return title
    .replace(/^(Function|Interface|Type Alias|Variable):\s+/, "")
    .replaceAll("\\<", "<")
    .replaceAll("\\>", ">")
    .replaceAll("\\_", "_");
}

function referenceLink(
  prefix: string,
  currentSlug: string,
  href: string,
  hash: string,
): string {
  const currentDirectory = posix.dirname(`/${currentSlug}.md`);
  const target = posix
    .normalize(posix.join(currentDirectory, href))
    .replace(/^\//, "");
  const targetSlug = target.replace(/\.md$/, "").replace(/\/README$/, "");
  const suffix = targetSlug.length === 0 ? "/" : `/${targetSlug}/`;
  return `${prefix}${suffix}${hash}`;
}

function rewriteReferenceLinks(
  markdown: string,
  currentSlug: string,
  prefix: string,
): string {
  return markdown.replace(
    /\]\(([^)#]+\.md)(#[^)]+)?\)/g,
    (_match, href: string, hash: string | undefined) =>
      `](${referenceLink(prefix, currentSlug, href, hash ?? "")})`,
  );
}

function removeGeneratedPageHeader(markdown: string): string {
  const heading = /^#\s+.+(?:\r?\n|$)/m.exec(markdown);
  if (heading?.index === undefined) {
    return markdown;
  }

  return markdown.slice(heading.index + heading[0].length).trimStart();
}

export function renderApiReference(
  page: ApiReferencePage,
  referencePrefix: string,
): string {
  const markdown = rewriteReferenceLinks(
    removeGeneratedPageHeader(page.markdown),
    page.slug,
    referencePrefix,
  );
  const renderer = new Renderer();
  renderer.code = ({ lang, text }) => highlightCode(text, lang ?? "text");
  return marked.parse(markdown, { async: false, renderer });
}
