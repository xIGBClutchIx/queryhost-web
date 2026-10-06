import type { ReactNode } from "react";
import { QueryResult } from "@queryhost/web";

import {
  MINECRAFT_ONLINE,
  PREVIEW_GAMES,
  RUST_OFFLINE,
  RUST_PARTIAL,
} from "../../test/fixtures/playground.js";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page surface.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        borderRadius: 8,
      }}
    >
      <section className="query-output">{children}</section>
    </div>
  );
}

export function Online(): ReactNode {
  return (
    <Page>
      <QueryResult games={PREVIEW_GAMES} result={MINECRAFT_ONLINE} />
    </Page>
  );
}

export function PartialWithWarning(): ReactNode {
  return (
    <Page>
      <QueryResult games={PREVIEW_GAMES} result={RUST_PARTIAL} />
    </Page>
  );
}

export function Offline(): ReactNode {
  return (
    <Page>
      <QueryResult games={PREVIEW_GAMES} result={RUST_OFFLINE} />
    </Page>
  );
}
