import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import {
  API_REFERENCE_PAGES,
  apiReferenceLabel,
} from "../../lib/api-reference.js";
import { documentationHref } from "../../lib/site.js";

export const metadata = {
  activeHref: "/reference/",
  eyebrow: "Generated from queryhost",
  title: "API reference",
  description:
    "Package-owned TypeDoc output for every public QueryHost export.",
} as const satisfies DocsPageMetadata;

const groupedPages = Map.groupBy(API_REFERENCE_PAGES, (page) => page.category);
const groupedEntries = Array.from(groupedPages.entries());

function categoryLabel(category: string): string {
  if (category === "README") {
    return category;
  }

  return category
    .replaceAll("-", " ")
    .replace(/^./, (firstCharacter) => firstCharacter.toUpperCase());
}

export function ReferenceIndexPage(): ReactNode {
  return (
    <DocsLayout {...metadata}>
      <p>
        These pages are rendered from the generated Markdown inside the same
        verified package artifact used by the API. They are not rewritten or
        maintained as a second public contract in this repository.
      </p>
      <div className="reference-index">
        {groupedEntries.map(([category, pages]) => (
          <section className="reference-group" key={category}>
            <h2>{categoryLabel(category)}</h2>
            <ul>
              {pages.map((page) => (
                <li key={page.slug}>
                  <a href={documentationHref(`/reference/${page.slug}/`)}>
                    {apiReferenceLabel(page.title)}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </DocsLayout>
  );
}
