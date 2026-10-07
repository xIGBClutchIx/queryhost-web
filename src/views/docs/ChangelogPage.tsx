import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import { CHANGELOG_HTML } from "../../lib/changelog.js";

export const metadata = {
  activeHref: "/changelog/",
  title: "Changelog",
  description: "Release history for the QueryHost query library.",
} as const satisfies DocsPageMetadata;

export function ChangelogPage(): ReactNode {
  return <DocsLayout {...metadata} html={CHANGELOG_HTML} />;
}
