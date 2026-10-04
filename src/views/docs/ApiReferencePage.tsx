import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { PageProps } from "../page-props.js";
import {
  API_REFERENCE_PAGES,
  apiReferenceLabel,
  renderApiReference,
} from "../../lib/api-reference.js";
import type { ApiReferencePage as ReferencePage } from "../../lib/api-reference.js";
import { documentationHref } from "../../lib/site.js";

export const API_REFERENCE_DESCRIPTION =
  "Generated from the QueryHost package public TypeScript contract.";

interface ApiReferencePageProps extends PageProps {
  readonly page: ReferencePage;
}

export function ApiReferencePage({
  hostname,
  page,
}: ApiReferencePageProps): ReactNode {
  const referencePrefix = documentationHref(hostname, "/reference/").replace(
    /\/$/,
    "",
  );
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
      hostname={hostname}
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
