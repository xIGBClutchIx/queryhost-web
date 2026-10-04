import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import type { PageProps } from "../page-props.js";
import { CHANGELOG_HTML } from "../../lib/changelog.js";

export const metadata = {
  activeHref: "/changelog/",
  title: "Changelog",
  description: "Release history for the QueryHost query library.",
} as const satisfies DocsPageMetadata;

export function ChangelogPage({ hostname }: PageProps): ReactNode {
  return <DocsLayout {...metadata} hostname={hostname} html={CHANGELOG_HTML} />;
}
