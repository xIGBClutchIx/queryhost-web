import type { ReactNode } from "react";

import {
  BRAND_ICON_URL,
  documentationHref,
  GITHUB_REPOSITORY_URL,
  siteHref,
} from "../lib/site.js";

interface HeaderProps {
  readonly active: "docs" | "site";
  readonly hostname: string;
  /** Brand mark URL; defaults to the site's icon. */
  readonly iconSrc?: string | undefined;
}

export function Header({
  active,
  hostname,
  iconSrc = BRAND_ICON_URL,
}: HeaderProps): ReactNode {
  return (
    <header className="topbar">
      <div className={`topbar__inner topbar__inner--${active}`}>
        <a
          className="brand"
          href={siteHref(hostname)}
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

        <nav className="primary-nav" aria-label="Primary navigation">
          <a
            className={
              active === "docs"
                ? "primary-nav__link is-active"
                : "primary-nav__link"
            }
            href={documentationHref(hostname)}
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
