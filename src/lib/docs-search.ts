// Documentation search shared by the build-time index endpoint and the browser dialog.
// Matching is plain substring work over a small static index, so no search service or
// dependency is needed and the module stays browser-safe.

/** What a search entry points at, from whole pages down to reference members. */
export type DocsSearchKind = "game" | "member" | "page" | "section" | "symbol";

export interface DocsSearchEntry {
  readonly kind: DocsSearchKind;
  readonly title: string;
  /** Same-origin documentation URL, with a fragment for sections and members. */
  readonly href: string;
  /** Where the entry lives, such as its page or parent symbol. */
  readonly context: string;
  /** Space-separated lowercase names that also identify the entry, such as game IDs. */
  readonly aliases?: string;
  /** Lowercase text that matches but is not shown, such as a section's opening prose. */
  readonly keywords?: string;
}

/** Row anchor on the supported games table, so a game result lands on its row. */
export function gameAnchor(id: string): string {
  return `game-${id}`;
}

export const DOCS_SEARCH_INDEX_PATH = "/docs/search-index.json";

export const DOCS_SEARCH_KIND_LABELS: Readonly<Record<DocsSearchKind, string>> =
  {
    game: "Game",
    member: "Member",
    page: "Page",
    section: "Section",
    symbol: "Reference",
  };

const KINDS: ReadonlySet<string> = new Set(
  Object.keys(DOCS_SEARCH_KIND_LABELS),
);

// Pages outrank their sections. Members are the bulk of the index, so they get no kind
// bonus and half the title score: a guide or symbol with the same word comes first.
const KIND_WEIGHTS: Readonly<Record<DocsSearchKind, number>> = {
  page: 30,
  section: 20,
  symbol: 18,
  game: 16,
  member: 0,
};

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

function isKind(value: string): value is DocsSearchKind {
  return KINDS.has(value);
}

function parseEntry(value: JsonValue): DocsSearchEntry | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { aliases, context, href, keywords, kind, title } = value;
  if (
    typeof kind !== "string" ||
    !isKind(kind) ||
    typeof title !== "string" ||
    typeof href !== "string" ||
    !href.startsWith("/docs/") ||
    typeof context !== "string" ||
    (aliases !== undefined && typeof aliases !== "string") ||
    (keywords !== undefined && typeof keywords !== "string")
  ) {
    return undefined;
  }
  return {
    context,
    href,
    kind,
    title,
    ...(aliases === undefined ? {} : { aliases }),
    ...(keywords === undefined ? {} : { keywords }),
  };
}

/**
 * Validates a fetched index body. Malformed entries are dropped rather than failing
 * the whole search, and only same-origin documentation links survive.
 */
export function parseDocsSearchIndex(text: string): readonly DocsSearchEntry[] {
  let value: JsonValue;
  try {
    value = JSON.parse(text) as JsonValue;
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map(parseEntry)
    .filter((entry): entry is DocsSearchEntry => entry !== undefined);
}

/** Lowercase search terms; whitespace separates terms that must all match. */
export function searchTerms(query: string): readonly string[] {
  return query.toLowerCase().split(/\s+/u).filter(Boolean);
}

function isWordStart(text: string, index: number): boolean {
  if (index === 0) return true;
  const previous = text[index - 1] ?? "";
  const current = text[index] ?? "";
  // camelCase members such as `queryPort` start a word at the capital.
  return (
    !/[\p{L}\p{N}]/u.test(previous) ||
    (/\p{Ll}/u.test(previous) && /\p{Lu}/u.test(current))
  );
}

/** Best score for one term within a title, or 0 when the title lacks it. */
function titleScore(title: string, lowerTitle: string, term: string): number {
  if (lowerTitle === term) return 100;
  if (lowerTitle.startsWith(term)) return 60;
  let index = lowerTitle.indexOf(term);
  let best = index === -1 ? 0 : 10;
  while (index !== -1) {
    if (isWordStart(title, index)) return Math.max(best, 40);
    index = lowerTitle.indexOf(term, index + 1);
  }
  return best;
}

function entryScore(
  entry: DocsSearchEntry,
  terms: readonly string[],
  phrase: string,
): number {
  const lowerTitle = entry.title.toLowerCase();
  const lowerContext = entry.context.toLowerCase();
  const keywords = entry.keywords ?? "";
  const aliases = ` ${entry.aliases ?? ""}`;
  let total = KIND_WEIGHTS[entry.kind];
  for (const term of terms) {
    const score = Math.max(
      titleScore(entry.title, lowerTitle, term) *
        (entry.kind === "member" ? 0.5 : 1),
      aliases.includes(` ${term} `) || aliases.endsWith(` ${term}`)
        ? 60
        : aliases.includes(` ${term}`)
          ? 30
          : 0,
      keywords.includes(term) ? 15 : 0,
      // Context counts only from a word start, so "port" skips "Supported games".
      titleScore(entry.context, lowerContext, term) >= 40 ? 5 : 0,
    );
    if (score === 0) return 0;
    total += score;
  }
  // A multi-word query typed exactly as the title beats one matching scattered words.
  if (terms.length > 1 && lowerTitle.includes(phrase)) total += 50;
  return total;
}

export const DOCS_SEARCH_RESULT_LIMIT = 20;

/**
 * Entries containing every term, best first; ties keep index order, which follows the
 * documentation's reading order. An empty query lists the documentation pages.
 */
export function searchDocs(
  entries: readonly DocsSearchEntry[],
  query: string,
  limit = DOCS_SEARCH_RESULT_LIMIT,
): readonly DocsSearchEntry[] {
  const terms = searchTerms(query);
  if (terms.length === 0) {
    return entries.filter((entry) => entry.kind === "page").slice(0, limit);
  }
  const phrase = terms.join(" ");
  return entries
    .map((entry, index) => ({
      entry,
      index,
      score: entryScore(entry, terms, phrase),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, limit)
    .map((candidate) => candidate.entry);
}

export interface HighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

/** Splits `text` into plain and matched runs for every occurrence of each term. */
export function highlightSegments(
  text: string,
  terms: readonly string[],
): readonly HighlightSegment[] {
  const lower = text.toLowerCase();
  const marked = Array.from({ length: text.length }, () => false);
  for (const term of terms) {
    let index = lower.indexOf(term);
    while (index !== -1) {
      marked.fill(true, index, index + term.length);
      index = lower.indexOf(term, index + term.length);
    }
  }
  const segments: HighlightSegment[] = [];
  let start = 0;
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || marked[index] !== marked[start]) {
      segments.push({
        text: text.slice(start, index),
        match: marked[start] ?? false,
      });
      start = index;
    }
  }
  return segments;
}
