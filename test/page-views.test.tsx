import type { VNode } from "preact";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Callout } from "../src/components/Callout.js";
import {
  API_REFERENCE_PAGES,
  apiReferencePage,
} from "../src/lib/api-reference.js";
import { adjacentDocumentationPages } from "../src/lib/navigation.js";
import { documentationHref } from "../src/lib/site.js";
import { QUERYHOST_VERSION } from "../src/lib/package-version.js";
import {
  apiReferenceDescription,
  ApiReferencePage,
} from "../src/views/docs/ApiReferencePage.js";
import * as changelog from "../src/views/docs/ChangelogPage.js";
import * as credits from "../src/views/docs/CreditsPage.js";
import * as errors from "../src/views/docs/ErrorsPage.js";
import * as games from "../src/views/docs/GamesPage.js";
import * as gettingStarted from "../src/views/docs/GettingStartedPage.js";
import * as hostedService from "../src/views/docs/HostedServicePage.js";
import * as publicApi from "../src/views/docs/PublicApiPage.js";
import * as querying from "../src/views/docs/QueryingPage.js";
import * as referenceIndex from "../src/views/docs/ReferenceIndexPage.js";
import * as results from "../src/views/docs/ResultsPage.js";
import * as webMcp from "../src/views/docs/WebMcpPage.js";
import { NotFoundPage } from "../src/views/NotFoundPage.js";
import { PrivacyPage } from "../src/views/PrivacyPage.js";
import { TermsPage } from "../src/views/TermsPage.js";

const DOCS_VIEWS = [
  [changelog.metadata, changelog.ChangelogPage],
  [credits.metadata, credits.CreditsPage],
  [errors.metadata, errors.ErrorsPage],
  [games.metadata, games.GamesPage],
  [gettingStarted.metadata, gettingStarted.GettingStartedPage],
  [hostedService.metadata, hostedService.HostedServicePage],
  [publicApi.metadata, publicApi.PublicApiPage],
  [querying.metadata, querying.QueryingPage],
  [referenceIndex.metadata, referenceIndex.ReferenceIndexPage],
  [results.metadata, results.ResultsPage],
  [webMcp.metadata, webMcp.WebMcpPage],
] as const;

function render(view: VNode): string {
  return renderToStaticMarkup(view);
}

describe("server-rendered documentation views", () => {
  it.each(DOCS_VIEWS)(
    "renders %o as static HTML with the active navigation link",
    (metadata, View) => {
      const html = render(<View />);
      expect(html).toContain(`<h1>${metadata.title}</h1>`);
      expect(html).toContain(
        `href="${documentationHref(metadata.activeHref)}" aria-current="page"`,
      );
      expect(html).not.toContain("<script");
    },
  );

  it("uses same-origin documentation links", () => {
    const html = render(<querying.QueryingPage />);
    expect(html).toContain('href="/docs/querying/" aria-current="page"');
    expect(html).not.toContain("docs.query.host");
  });

  it("highlights the complete install and first-query examples", () => {
    const html = render(<gettingStarted.GettingStartedPage />);
    const text = html.replaceAll(/<[^>]+>/g, "");
    expect(text).toContain(`npm install queryhost@${QUERYHOST_VERSION}`);
    expect(text).toContain('import { query } from "queryhost";');
    expect(text).toContain("to the RustData type");
  });

  it("links each page to its neighbors in sidebar order", () => {
    expect(adjacentDocumentationPages("/")).toEqual({
      next: { href: "/querying/", label: "Query a server" },
    });
    expect(adjacentDocumentationPages("/changelog/")).toEqual({
      next: { href: "/games/", label: "Supported games" },
      previous: { href: "/results/", label: "Result semantics" },
    });
    expect(adjacentDocumentationPages("/reference/functions/query/")).toEqual(
      {},
    );

    const html = render(<querying.QueryingPage />);
    expect(html).toContain(
      'href="/docs/" rel="prev"><span>Previous</span> <strong>Getting started</strong>',
    );
    expect(html).toContain(
      'href="/docs/results/" rel="next"><span>Next</span> <strong>Result semantics</strong>',
    );
  });

  it("reserves a contents column only on pages with several sections", () => {
    for (const html of [
      render(<querying.QueryingPage />),
      render(<changelog.ChangelogPage />),
    ]) {
      expect(html).toContain('class="docs-shell docs-shell--contents"');
      expect(html).toContain("data-doc-toc");
    }
    for (const html of [
      render(<games.GamesPage />),
      render(<referenceIndex.ReferenceIndexPage />),
    ]) {
      expect(html).toContain('class="docs-shell"');
      expect(html).not.toContain("data-doc-toc");
    }
  });

  it("gives every game row filter text with its ID and aliases", () => {
    const html = render(<games.GamesPage />);
    expect(html).toContain("data-game-filter-control");
    expect(html).toMatch(
      /data-game-filter="counter-strike 2 counter-strike-2[^"]*cs2/,
    );
  });

  it("hides code copy buttons until the page script enables them", () => {
    const html = render(<gettingStarted.GettingStartedPage />);
    expect(html).toContain(
      '<button class="code-block__copy" type="button" data-code-copy aria-label="Copy Terminal code" hidden>Copy</button>',
    );
  });

  it("renders package API reference pages with their category context", () => {
    const page = apiReferencePage("functions/query");
    if (page === undefined) throw new Error("Missing query reference page.");
    const html = render(<ApiReferencePage page={page} />);
    expect(html).toContain('class="api-reference"');
    expect(html).toContain('class="docs-nav__reference-context"');
    expect(html).toContain('aria-current="page">query()</a>');
  });
});

describe("documentation content", () => {
  it("anchors each changelog release by its version", () => {
    const html = render(<changelog.ChangelogPage />);
    expect(html).toMatch(/<h2 id="v1\.8\.0"><a href="[^"]+">1\.8\.0<\/a>/);
    // Only releases are anchored; their repeated subsection headings are not.
    expect(html).not.toMatch(/<h3 id=/);
  });

  it("describes each API reference page by its symbol summary", () => {
    const page = apiReferencePage("functions/isGameId");
    if (page === undefined) throw new Error("Missing reference page.");
    expect(apiReferenceDescription(page)).toBe(
      "Returns whether an arbitrary string is a registered game identifier.",
    );
    const longest = API_REFERENCE_PAGES.map(apiReferenceDescription).reduce(
      (left, right) => (right.length > left.length ? right : left),
    );
    expect(longest.length).toBeLessThanOrEqual(160);
  });

  it("lists every query, detection, and warning code", () => {
    const html = render(<errors.ErrorsPage />);
    for (const code of [
      "ABORTED",
      "CONNECTION_FAILED",
      "DNS_FAILED",
      "INTERNAL_ERROR",
      "INVALID_INPUT",
      "MALFORMED_RESPONSE",
      "RESPONSE_TOO_LARGE",
      "TARGET_BLOCKED",
      "TIMEOUT",
      "NOT_DETECTED",
      "PARTIAL_RESULT",
      "SOURCE_TIMEOUT",
    ]) {
      expect(html).toContain(`<th scope="row"><code>${code}</code></th>`);
    }
  });

  it("separates game aliases and keeps tables in scroll wrappers", () => {
    const html = render(<querying.QueryingPage />);
    expect(html).toMatch(/<code>[\w-]+<\/code>, <code>[\w-]+<\/code>/);
    expect(html).not.toContain("No*");
    for (const view of [
      render(<publicApi.PublicApiPage />),
      html,
      render(<webMcp.WebMcpPage />),
      render(<errors.ErrorsPage />),
    ]) {
      expect(view.split('<table class="data-table"').length).toBe(
        view.split('<div class="table-scroll"><table class="data-table"')
          .length,
      );
    }
  });

  it("derives the capability header groups from the capability columns", () => {
    const html = render(<games.GamesPage />);
    expect(html).toContain('<th scope="colgroup" colspan="3">Core</th>');
    expect(html).toContain('<th scope="colgroup">Discovery</th>');
    expect(html).toContain(
      '<span aria-hidden="true">—</span><span class="sr-only">Not applicable</span>',
    );
  });
});

describe("callouts", () => {
  it("marks warnings with a distinct glyph", () => {
    const info = render(<Callout title="Note">Body</Callout>);
    const warning = render(
      <Callout title="Careful" tone="warning">
        Body
      </Callout>,
    );
    expect(info).toContain(
      '<div class="callout__mark" aria-hidden="true">i</div>',
    );
    expect(warning).toContain(
      '<div class="callout__mark" aria-hidden="true">!</div>',
    );
  });

  it("titles notes without headings and names their tone for screen readers", () => {
    const info = render(<Callout title="Note title">Body</Callout>);
    const warning = render(
      <Callout title="Careful" tone="warning">
        Body
      </Callout>,
    );
    expect(info).not.toMatch(/<h\d/);
    expect(info).toContain(
      '<p class="callout__title"><span class="sr-only">Note: </span>Note title</p>',
    );
    expect(warning).toContain(
      '<span class="sr-only">Warning: </span>Careful</p>',
    );
  });
});

describe("server-rendered site views", () => {
  it("renders policies and the not-found page with the site header", () => {
    for (const html of [
      render(<PrivacyPage />),
      render(<TermsPage />),
      render(<NotFoundPage />),
    ]) {
      expect(html).toContain(
        'href="/" aria-label="QueryHost home" aria-current="page"',
      );
      expect(html).toContain('id="main-content"');
    }
  });
});
