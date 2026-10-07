import type { ReactNode } from "react";
import { DocsMobileNavigation } from "@queryhost/web";

// Only visible below 50rem; the card renders at a phone-width viewport.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
      }}
    >
      {children}
    </div>
  );
}

export function Collapsed(): ReactNode {
  return (
    <Page>
      <DocsMobileNavigation activeHref="/querying/" />
    </Page>
  );
}

/** The native details menu, opened on mount. */
export function Open(): ReactNode {
  return (
    <Page>
      <div
        ref={(element) => {
          const details = element?.querySelector("details");
          if (details) details.open = true;
        }}
      >
        <DocsMobileNavigation activeHref="/querying/" />
      </div>
    </Page>
  );
}
