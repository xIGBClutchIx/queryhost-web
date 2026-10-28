import type { ReactNode } from "react";

import { Header } from "./Header.js";
import "../styles/policy.css";

interface PolicyLayoutProps {
  readonly children: ReactNode;
  /** The date this policy took effect, as in "October 1, 2026". */
  readonly effective: string;
  readonly title: string;
}

export function PolicyLayout({
  children,
  effective,
  title,
}: PolicyLayoutProps): ReactNode {
  return (
    <>
      <Header active="site" />
      <main id="main-content" className="policy">
        <h1>{title}</h1>
        <p className="policy-date">Effective {effective}</p>
        {children}
        <nav className="policy-links" aria-label="Service policies">
          <a href="/privacy/">Privacy policy</a>
          <a href="/terms/">Terms of service</a>
          <a href="mailto:lockerzmodding@gmail.com">Contact</a>
        </nav>
      </main>
    </>
  );
}
