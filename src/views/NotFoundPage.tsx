import type { ReactNode } from "react";

import type { PageProps } from "./page-props.js";
import { Header } from "../components/Header.js";
import { documentationHref } from "../lib/site.js";

export const metadata = {
  title: "Page not found",
  description: "The requested QueryHost page does not exist.",
} as const;

export function NotFoundPage({ hostname }: PageProps): ReactNode {
  return (
    <>
      <Header active="site" hostname={hostname} />
      <main className="not-found" id="main-content">
        <p className="eyebrow">404</p>
        <h1>That page is not here.</h1>
        <p>
          The path may have moved, or it may belong to a later QueryHost slice.
        </p>
        <a
          className="button button--primary"
          href={documentationHref(hostname)}
        >
          Open documentation
        </a>
      </main>
    </>
  );
}
