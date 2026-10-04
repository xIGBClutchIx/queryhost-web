import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { apiReferencePage } from "../src/lib/api-reference.js";
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

  it("renders package API reference pages with their category context", () => {
    const page = apiReferencePage("functions/query");
    if (page === undefined) throw new Error("Missing query reference page.");
    const html = render(<ApiReferencePage hostname="localhost" page={page} />);
    expect(html).toContain('class="api-reference"');
    expect(html).toContain('class="docs-nav__reference-context"');
    expect(html).toContain('aria-current="page">query()</a>');
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
