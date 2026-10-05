import type { ReactNode } from "react";

interface CalloutProps {
  readonly children: ReactNode;
  readonly title: string;
  readonly tone?: "info" | "warning";
}

/** Highlighted documentation note rendered without client JavaScript. */
export function Callout({
  children,
  title,
  tone = "info",
}: CalloutProps): ReactNode {
  return (
    <aside className={`callout callout--${tone}`}>
      <div className="callout__mark" aria-hidden="true">
        {tone === "warning" ? "!" : "i"}
      </div>
      <div>
        <h2>{title}</h2>
        <div className="callout__body">{children}</div>
      </div>
    </aside>
  );
}
