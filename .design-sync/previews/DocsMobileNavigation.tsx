import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { DocsMobileNavigation } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({
  children,
  width = 1040,
  height,
}: {
  children: ReactNode;
  width?: number;
  height?: number;
}) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        width,
        minHeight: height,
      }}
    >
      {children}
    </div>
  );
}

export const Closed = () => (
  <Page width={372}>
    <DocsMobileNavigation activeHref="/querying/" hostname="docs.query.host" />
  </Page>
);

// The menu is a native <details>; this story opens it through its real summary.
export const Open = () => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector("summary")?.click();
  }, []);
  return (
    <Page width={372} height={520}>
      <div ref={ref}>
        <DocsMobileNavigation
          activeHref="/querying/"
          hostname="docs.query.host"
        />
      </div>
    </Page>
  );
};
