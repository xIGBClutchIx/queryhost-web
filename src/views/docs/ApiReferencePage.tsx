import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import {
  API_REFERENCE_PAGES,
  apiReferenceLabel,
  apiReferenceSummary,
  renderApiReference,
} from "../../lib/api-reference.js";
import type { ApiReferencePage as ReferencePage } from "../../lib/api-reference.js";
import { documentationHref } from "../../lib/site.js";

export const API_REFERENCE_DESCRIPTION =
  "Generated from the QueryHost package public TypeScript contract.";

/** Longest meta description before it is shortened at a word boundary. */
const META_DESCRIPTION_LENGTH = 160;

/** The page's meta description: its symbol summary, or the shared one when it has none. */
export function apiReferenceDescription(page: ReferencePage): string {
  const summary = apiReferenceSummary(
    renderApiReference(page, documentationHref("/reference/")),
  );
  if (summary.length === 0) return API_REFERENCE_DESCRIPTION;
  if (summary.length <= META_DESCRIPTION_LENGTH) return summary;
  const cut = summary.lastIndexOf(" ", META_DESCRIPTION_LENGTH - 1);
  return `${summary.slice(0, cut === -1 ? META_DESCRIPTION_LENGTH - 1 : cut)}…`;
}

interface ApiReferencePageProps {
  readonly page: ReferencePage;
}

export function ApiReferencePage({ page }: ApiReferencePageProps): ReactNode {
  const referencePrefix = documentationHref("/reference/").replace(/\/$/, "");
  const reference = {
    items: API_REFERENCE_PAGES.filter(
      (candidate) => candidate.category === page.category,
    ).map((candidate) => ({
      href: `/reference/${candidate.slug}/`,
      label: apiReferenceLabel(candidate.title),
    })),
    label: page.category.replaceAll("-", " "),
  };

  return (
    <DocsLayout
      activeHref={`/reference/${page.slug}/`}
      eyebrow={`API reference · ${page.category}`}
      title={page.title}
      description={API_REFERENCE_DESCRIPTION}

      reference={reference}
    >
      <article
        className="api-reference"
        // TypeDoc Markdown from the verified package, rendered on the server.
        dangerouslySetInnerHTML={{
          __html: renderApiReference(page, referencePrefix),
        }}
      />
    </DocsLayout>
  );
}
