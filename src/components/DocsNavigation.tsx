import type { ReactNode } from "react";

import { DOCUMENTATION_NAVIGATION } from "../lib/navigation.js";
import type { NavigationItem, NavigationSection } from "../lib/navigation.js";
import { documentationHref } from "../lib/site.js";

export interface ReferenceContext {
  readonly items: readonly NavigationItem[];
  readonly label: string;
}

interface DocsNavigationProps {
  readonly activeHref: string;
  readonly reference?: ReferenceContext | undefined;
  /** Navigation tree; defaults to the site's documentation sections. */
  readonly sections?: readonly NavigationSection[] | undefined;
}

interface DocsLinkProps {
  readonly activeHref: string;
  readonly item: NavigationItem;
}

function navLabelId(label: string): string {
  return `docs-nav-${label.toLowerCase().replaceAll(/[^a-z\d]+/gu, "-")}`;
}

function DocsLink({ activeHref, item }: DocsLinkProps): ReactNode {
  const active = activeHref === item.href;
  return (
    <a
      className={active ? "is-active" : undefined}
      href={documentationHref(item.href)}
      aria-current={active ? "page" : undefined}
    >
      {item.label}
    </a>
  );
}

/** Desktop sidebar navigation; its scroll and active state survive client routing. */
export function DocsSidebar({
  activeHref,
  reference,
  sections = DOCUMENTATION_NAVIGATION,
}: DocsNavigationProps): ReactNode {
  return (
    <nav className="docs-nav" aria-label="Documentation navigation">
      {/* The sidebar precedes the page's h1, so its labels are not headings;
          each list is named by its label instead. */}
      {sections.map((section) => (
        <div className="docs-nav__section" key={section.label}>
          <p className="docs-nav__label" id={navLabelId(section.label)}>
            {section.label}
          </p>
          <ul aria-labelledby={navLabelId(section.label)}>
            {section.items.map((item) => (
              <li key={item.href}>
                <DocsLink
                  activeHref={activeHref}

                  item={item}
                />
              </li>
            ))}
          </ul>
          {section.label === "Reference" && reference !== undefined && (
            <div className="docs-nav__reference-context">
              <p
                className="docs-nav__context-label"
                id="docs-nav-reference-context"
              >
                {reference.label}
              </p>
              <ul aria-labelledby="docs-nav-reference-context">
                {reference.items.map((item) => (
                  <li key={item.href}>
                    <DocsLink
                      activeHref={activeHref}

                      item={item}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

/** Mobile disclosure menu built on native details, so it works before any script. */
export function DocsMobileNavigation({
  activeHref,
  reference,
  sections = DOCUMENTATION_NAVIGATION,
}: DocsNavigationProps): ReactNode {
  return (
    <div className="docs-mobile-nav">
      <details>
        <summary>Documentation menu</summary>
        <nav aria-label="Mobile documentation navigation">
          {sections
            .flatMap((section) => section.items)
            .map((item) => (
              <DocsLink
                key={item.href}
                activeHref={activeHref}

                item={item}
              />
            ))}
          {reference !== undefined && (
            <>
              <span className="docs-mobile-nav__context">
                {reference.label}
              </span>
              {reference.items.map((item) => (
                <DocsLink
                  key={item.href}
                  activeHref={activeHref}

                  item={item}
                />
              ))}
            </>
          )}
        </nav>
      </details>
    </div>
  );
}
