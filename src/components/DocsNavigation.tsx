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
      {sections.map((section) => (
        <section className="docs-nav__section" key={section.label}>
          <h2>{section.label}</h2>
          <ul>
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
              <h3>{reference.label}</h3>
              <ul>
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
        </section>
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
