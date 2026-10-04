import type { ReactNode } from "react";

import { Header } from "./Header.js";

interface PolicyLayoutProps {
  readonly children: ReactNode;
  readonly hostname: string;
  readonly title: string;
}

export function PolicyLayout({
  children,
  hostname,
  title,
}: PolicyLayoutProps): ReactNode {
  return (
    <>
      <Header active="site" hostname={hostname} />
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
