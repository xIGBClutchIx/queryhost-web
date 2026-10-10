// Builds the documentation search index from rendered pages, the game registry, and the
// packaged API reference. It runs at build time, so the browser only downloads JSON.
import {
  API_REFERENCE_PAGES,
  apiReferenceLabel,
  renderApiReference,
} from "./api-reference.js";
import { gameAnchor } from "./docs-search.js";
import type { DocsSearchEntry } from "./docs-search.js";
import { DOCUMENTATION_NAVIGATION } from "./navigation.js";
import { aliasesForGame, GAMES } from "./queryhost.js";
import { documentationHref } from "./site.js";

/** A server-rendered documentation page and the navigation entry it belongs to. */
export interface RenderedDocsPage {
  readonly description: string;
  readonly href: string;
  readonly html: string;
}

interface Heading {
  readonly id: string;
  readonly level: number;
  readonly text: string;
  /** Plain text between this heading and the next one, or the page's pager. */
  readonly body: string;
}

/** Body text kept per section: enough to match its key terms without shipping prose. */
const KEYWORD_LENGTH = 400;

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  gt: ">",
  lt: "<",
  quot: '"',
  "#39": "'",
  "#x27": "'",
};

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&(amp|gt|lt|quot|#39|#x27);/g, (_match, name: string) => {
      return ENTITIES[name] ?? "";
    })
    .replace(/\s+/g, " ")
    .trim();
}

function keywords(text: string): string {
  return text.slice(0, KEYWORD_LENGTH).toLowerCase();
}

/** Anchored h2 and h3 headings, in document order, from trusted rendered HTML. */
export function anchoredHeadings(html: string): readonly Heading[] {
  const matches = [
    ...html.matchAll(/<h([23]) id="([^"]+)"[^>]*>([\s\S]*?)<\/h\1>/g),
  ];
  return matches
    .map((match, position) => {
      const [whole, level = "", id = "", inner = ""] = match;
      const start = match.index + whole.length;
      const pager = html.indexOf("<nav", start);
      const end = Math.min(
        matches[position + 1]?.index ?? html.length,
        pager === -1 ? html.length : pager,
      );
      return {
        body: plainText(html.slice(start, end)),
        id,
        level: Number(level),
        text: plainText(inner),
      };
    })
    .filter((heading) => heading.text.length > 0);
}

function pageEntries(
  pages: readonly RenderedDocsPage[],
): readonly DocsSearchEntry[] {
  const rendered = new Map(pages.map((page) => [page.href, page]));
  return DOCUMENTATION_NAVIGATION.flatMap((section) =>
    section.items.flatMap((item): readonly DocsSearchEntry[] => {
      const page = rendered.get(item.href);
      // A page added to the navigation must be rendered for the index too.
      if (page === undefined) {
        throw new Error(`Documentation page ${item.href} was not rendered.`);
      }
      const href = documentationHref(item.href);
      const entry: DocsSearchEntry = {
        context: section.label,
        href,
        keywords: keywords(page.description),
        kind: "page",
        title: item.label,
      };
      const sections = anchoredHeadings(page.html).map(
        (heading): DocsSearchEntry => ({
          context: item.label,
          href: `${href}#${heading.id}`,
          keywords: keywords(heading.body),
          kind: "section",
          title: heading.text,
        }),
      );
      return [entry, ...sections];
    }),
  );
}

function gameEntries(): readonly DocsSearchEntry[] {
  const href = documentationHref("/games/");
  return GAMES.map((game) => ({
    context: "Supported games",
    href: `${href}#${gameAnchor(game.id)}`,
    aliases: [game.id, ...aliasesForGame(game.id)].join(" ").toLowerCase(),
    kind: "game",
    title: game.name,
  }));
}

// h3 headings under these sections name members; others, such as type parameters, are
// too generic to search.
const MEMBER_SECTIONS: ReadonlySet<string> = new Set([
  "Methods",
  "Parameters",
  "Properties",
  "Type Declaration",
]);

// Per-game data shapes and registry maps repeat the same member names dozens of times
// (`players`, one key per game); their symbols stay searchable, their members do not.
function indexesMembers(label: string): boolean {
  return !/(Data|Map)$/.test(label);
}

function referenceEntries(): readonly DocsSearchEntry[] {
  const prefix = documentationHref("/reference/").replace(/\/$/, "");
  return API_REFERENCE_PAGES.filter((page) => page.slug.length > 0).flatMap(
    (page): readonly DocsSearchEntry[] => {
      const href = documentationHref(`/reference/${page.slug}`);
      const label = apiReferenceLabel(page.title);
      // "Interface: QueryOptions" names the symbol's kind, shown as its context.
      const kind = /^(\w[\w ]*):/.exec(page.title)?.[1] ?? "Reference";
      const html = renderApiReference(page, prefix);
      // The summary is the generated page's first paragraph.
      const summary = plainText(/<p>([\s\S]*?)<\/p>/.exec(html)?.[1] ?? "");
      const symbol: DocsSearchEntry = {
        context: kind,
        href,
        keywords: keywords(summary),
        kind: "symbol",
        title: label,
      };
      if (!indexesMembers(label)) return [symbol];
      let section = "";
      const members = anchoredHeadings(html)
        .filter((heading) => {
          if (heading.level === 2) section = heading.text;
          return heading.level === 3 && MEMBER_SECTIONS.has(section);
        })
        .map((heading): DocsSearchEntry => ({
          context: label,
          href: `${href}#${heading.id}`,
          kind: "member",
          title: heading.text,
        }));
      return [symbol, ...members];
    },
  );
}

/** Every search entry, in reading order: guides, games, then the API reference. */
export function buildDocsSearchIndex(
  pages: readonly RenderedDocsPage[],
): readonly DocsSearchEntry[] {
  return [...pageEntries(pages), ...gameEntries(), ...referenceEntries()];
}
