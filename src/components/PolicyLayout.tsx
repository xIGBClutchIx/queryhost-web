import type { ReactNode } from "react";

import { Header } from "./Header.js";
import "../styles/policy.css";

interface PolicyLayoutProps {
  readonly children: ReactNode;
  readonly title: string;
}

export function PolicyLayout({
  children,
  title,
}: PolicyLayoutProps): ReactNode {
  return (
    <>
      <Header active="site" />
      <main id="main-content" className="policy">
        <h1>{title}</h1>
        <p className="policy-date">Effective October 1, 2026</p>
        {children}
        <nav className="policy-links" aria-label="Service policies">
          <a href="/privacy">Privacy policy</a>
          <a href="/terms">Terms of service</a>
          <a href="mailto:lockerzmodding@gmail.com">Contact</a>
        </nav>
      </main>
    </>
  );
}
