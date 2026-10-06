import type { ReactNode } from "react";

import { DocsMobileNavigation, DocsSidebar } from "./DocsNavigation.js";
import type { ReferenceContext } from "./DocsNavigation.js";
import type { PageProps } from "../views/page-props.js";
import { DocsPager } from "./DocsPager.js";
import { Header } from "./Header.js";
import "../styles/docs.css";

/** Route-independent metadata each documentation view declares once. */
export interface DocsPageMetadata {
  readonly activeHref: string;
  readonly description: string;
  readonly eyebrow?: string;
  readonly title: string;
  readonly wide?: boolean;
}

type DocsLayoutProps = DocsPageMetadata &
  PageProps & {
    readonly reference?: ReferenceContext | undefined;
  } & (
    | { readonly children: ReactNode; readonly html?: never }
    // Trusted HTML rendered on the server from package-owned Markdown.
    | { readonly children?: never; readonly html: string }
  );

export function DocsLayout({
  activeHref,
  children,
  description,
  eyebrow,
  hostname,
  html,
  reference,
  title,
  wide = false,
}: DocsLayoutProps): ReactNode {
  return (
    <>
      <Header active="docs" hostname={hostname} />
      <DocsMobileNavigation
        activeHref={activeHref}
        hostname={hostname}
        reference={reference}
      />
      <div className={wide ? "docs-shell docs-shell--wide" : "docs-shell"}>
        <aside className="docs-sidebar">
          <DocsSidebar
            activeHref={activeHref}
            hostname={hostname}
            reference={reference}
          />
        </aside>
        <main
          className={wide ? "doc-content doc-content--wide" : "doc-content"}
          id="main-content"
        >
          <header className="doc-heading">
            {eyebrow !== undefined && <p className="eyebrow">{eyebrow}</p>}
            <h1>{title}</h1>
            <p>{description}</p>
          </header>
          {html === undefined ? (
            <div className="doc-prose">{children}</div>
          ) : (
            <div
              className="doc-prose"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
          <DocsPager activeHref={activeHref} hostname={hostname} />
        </main>
        {!wide && (
          <aside className="doc-toc-column">
            {/* Filled from the page's sections by the shared page script. */}
            <nav
              className="doc-toc"
              aria-label="On this page"
              data-doc-toc=""
              hidden
            >
              <p className="doc-toc__label">On this page</p>
              <ol />
            </nav>
          </aside>
        )}
      </div>
    </>
  );
}
