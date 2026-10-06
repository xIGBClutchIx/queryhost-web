import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Callout } from "../src/components/Callout.js";
import { apiReferencePage } from "../src/lib/api-reference.js";
import { adjacentDocumentationPages } from "../src/lib/navigation.js";
import { QUERYHOST_VERSION } from "../src/lib/package-version.js";
import { ApiReferencePage } from "../src/views/docs/ApiReferencePage.js";
import * as changelog from "../src/views/docs/ChangelogPage.js";
import * as errors from "../src/views/docs/ErrorsPage.js";
import * as games from "../src/views/docs/GamesPage.js";
import * as gettingStarted from "../src/views/docs/GettingStartedPage.js";
import * as hostedService from "../src/views/docs/HostedServicePage.js";
import * as querying from "../src/views/docs/QueryingPage.js";
import * as referenceIndex from "../src/views/docs/ReferenceIndexPage.js";
import * as results from "../src/views/docs/ResultsPage.js";
import * as webMcp from "../src/views/docs/WebMcpPage.js";
import { NotFoundPage } from "../src/views/NotFoundPage.js";
import { PrivacyPage } from "../src/views/PrivacyPage.js";
import { TermsPage } from "../src/views/TermsPage.js";

const DOCS_VIEWS = [
  [changelog.metadata, changelog.ChangelogPage],
  [errors.metadata, errors.ErrorsPage],
  [games.metadata, games.GamesPage],
  [gettingStarted.metadata, gettingStarted.GettingStartedPage],
  [hostedService.metadata, hostedService.HostedServicePage],
  [querying.metadata, querying.QueryingPage],
  [referenceIndex.metadata, referenceIndex.ReferenceIndexPage],
  [results.metadata, results.ResultsPage],
  [webMcp.metadata, webMcp.WebMcpPage],
] as const;

function render(view: ReactNode): string {
  return renderToStaticMarkup(view);
}

describe("server-rendered documentation views", () => {
  it.each(DOCS_VIEWS)(
    "renders %o as static HTML with the active navigation link",
    (metadata, View) => {
      const html = render(<View hostname="docs.query.host" />);
      expect(html).toContain(`<h1>${metadata.title}</h1>`);
      expect(html).toContain(
        `href="https://docs.query.host${metadata.activeHref}" aria-current="page"`,
      );
      expect(html).not.toContain("<script");
    },
  );

  it("uses same-origin documentation links on preview hosts", () => {
    const html = render(<querying.QueryingPage hostname="localhost" />);
    expect(html).toContain('href="/docs/querying/" aria-current="page"');
    expect(html).not.toContain("https://docs.query.host");
  });

  it("highlights the complete install and first-query examples", () => {
    const html = render(
      <gettingStarted.GettingStartedPage hostname="query.host" />,
    );
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

    const html = render(<querying.QueryingPage hostname="docs.query.host" />);
    expect(html).toContain(
      'href="https://docs.query.host/" rel="prev"><span>Previous</span> <strong>Getting started</strong>',
    );
    expect(html).toContain(
      'href="https://docs.query.host/results/" rel="next"><span>Next</span> <strong>Result semantics</strong>',
    );
  });

  it("reserves a contents column only on pages with several sections", () => {
    const querying_ = render(<querying.QueryingPage hostname="localhost" />);
    expect(querying_).toContain('class="docs-shell docs-shell--contents"');
    expect(querying_).toContain('data-doc-toc=""');
    for (const html of [
      render(<games.GamesPage hostname="localhost" />),
      render(<referenceIndex.ReferenceIndexPage hostname="localhost" />),
      render(<changelog.ChangelogPage hostname="localhost" />),
    ]) {
      expect(html).toContain('class="docs-shell"');
      expect(html).not.toContain("data-doc-toc");
    }
  });

  it("gives every game row filter text with its ID and aliases", () => {
    const html = render(<games.GamesPage hostname="localhost" />);
    expect(html).toContain('data-game-filter-control=""');
    expect(html).toMatch(
      /data-game-filter="counter-strike 2 counter-strike-2[^"]*cs2/,
    );
  });

  it("hides code copy buttons until the page script enables them", () => {
    const html = render(
      <gettingStarted.GettingStartedPage hostname="localhost" />,
    );
    expect(html).toContain(
      '<button class="code-block__copy" type="button" data-code-copy="" aria-label="Copy Terminal code" hidden="">Copy</button>',
    );
  });

  it("renders package API reference pages with their category context", () => {
    const page = apiReferencePage("functions/query");
    if (page === undefined) throw new Error("Missing query reference page.");
    const html = render(<ApiReferencePage hostname="localhost" page={page} />);
    expect(html).toContain('class="api-reference"');
    expect(html).toContain('class="docs-nav__reference-context"');
    expect(html).toContain('aria-current="page">query()</a>');
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
});

describe("server-rendered site views", () => {
  it("renders policies and the not-found page with the site header", () => {
    for (const html of [
      render(<PrivacyPage hostname="query.host" />),
      render(<TermsPage hostname="query.host" />),
      render(<NotFoundPage hostname="query.host" />),
    ]) {
      expect(html).toContain(
        'href="https://query.host/" aria-label="QueryHost home" aria-current="page"',
      );
      expect(html).toContain('id="main-content"');
    }
  });
});
