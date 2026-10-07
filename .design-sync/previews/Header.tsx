import type { ReactNode } from "react";
import { Header } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page background.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div style={{ background: "var(--background)", color: "var(--text)" }}>
      {children}
    </div>
  );
}

/** Marketing site header on query.host. */
export function Site(): ReactNode {
  return (
    <Page>
      <Header active="site" />
    </Page>
  );
}

/** Documentation header: the Docs link is the current page. */
export function Docs(): ReactNode {
  return (
    <Page>
      <Header active="docs" />
    </Page>
  );
}
