import type { ReactNode } from "react";

import {
  BRAND_ICON_URL,
  documentationHref,
  GITHUB_REPOSITORY_URL,
} from "../lib/site.js";

interface HeaderProps {
  readonly active: "docs" | "site";
  /** Brand mark URL; defaults to the site's icon. */
  readonly iconSrc?: string | undefined;
}

export function Header({
  active,
  iconSrc = BRAND_ICON_URL,
}: HeaderProps): ReactNode {
  return (
    <header className="topbar">
      <div className={`topbar__inner topbar__inner--${active}`}>
        <a
          className="brand"
          href="/"
          aria-label="QueryHost home"
          aria-current={active === "site" ? "page" : undefined}
        >
          <img
            className="brand__icon"
            src={iconSrc}
            width="28"
            height="28"
            alt=""
          />
          <span>
            <span className="brand__query">Query</span>
            <span className="brand__host">Host</span>
          </span>
        </a>

        {active === "docs" && (
          // Revealed by the docs search script; the dialog it opens needs script anyway.
          <button
            type="button"
            className="docs-search-trigger"
            data-docs-search-open=""
            aria-haspopup="dialog"
            aria-keyshortcuts="/ Control+K Meta+K"
            hidden
          >
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <circle cx="7" cy="7" r="4.25" />
              <path d="m10.25 10.25 3.25 3.25" />
            </svg>
            <span className="docs-search-trigger__label">Search docs</span>
            <kbd className="docs-search-trigger__key" aria-hidden="true">
              /
            </kbd>
          </button>
        )}

        <nav className="primary-nav" aria-label="Primary navigation">
          <a
            className={
              active === "docs"
                ? "primary-nav__link is-active"
                : "primary-nav__link"
            }
            href={documentationHref()}
            aria-current={active === "docs" ? "page" : undefined}
          >
            Docs
          </a>
          <a className="primary-nav__link" href={GITHUB_REPOSITORY_URL}>
            GitHub
          </a>
        </nav>
      </div>
    </header>
  );
}
