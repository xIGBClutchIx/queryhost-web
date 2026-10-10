import type { APIRoute } from "astro";
import { h } from "preact";
import type { FunctionComponent } from "preact";
import { renderToStaticMarkup } from "preact-render-to-string";

import { buildDocsSearchIndex } from "../../lib/docs-search-index.js";
import * as changelog from "../../views/docs/ChangelogPage.tsx";
import * as errors from "../../views/docs/ErrorsPage.tsx";
import * as games from "../../views/docs/GamesPage.tsx";
import * as gettingStarted from "../../views/docs/GettingStartedPage.tsx";
import * as hostedService from "../../views/docs/HostedServicePage.tsx";
import * as publicApi from "../../views/docs/PublicApiPage.tsx";
import * as querying from "../../views/docs/QueryingPage.tsx";
import * as referenceIndex from "../../views/docs/ReferenceIndexPage.tsx";
import * as results from "../../views/docs/ResultsPage.tsx";
import * as webMcp from "../../views/docs/WebMcpPage.tsx";

// Rendered once at build time and served as a static file, so the server never
// renders views for search and the index always matches the shipped pages.
export const prerender = true;

const VIEWS: readonly (readonly [
  { readonly activeHref: string; readonly description: string },
  FunctionComponent,
])[] = [
  [changelog.metadata, changelog.ChangelogPage],
  [errors.metadata, errors.ErrorsPage],
  [games.metadata, games.GamesPage],
  [gettingStarted.metadata, gettingStarted.GettingStartedPage],
  [hostedService.metadata, hostedService.HostedServicePage],
  [publicApi.metadata, publicApi.PublicApiPage],
  [querying.metadata, querying.QueryingPage],
  [referenceIndex.metadata, referenceIndex.ReferenceIndexPage],
  [results.metadata, results.ResultsPage],
  [webMcp.metadata, webMcp.WebMcpPage],
];

export const GET = ((): Response => {
  const pages = VIEWS.map(([metadata, View]) => ({
    description: metadata.description,
    href: metadata.activeHref,
    html: renderToStaticMarkup(h(View, null)),
  }));
  return new Response(JSON.stringify(buildDocsSearchIndex(pages)), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
    status: 200,
  });
}) satisfies APIRoute;
