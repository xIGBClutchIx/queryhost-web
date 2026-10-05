import type { ReactNode } from "react";
import { PolicyLayout } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so the page supplies its own background.
export function Privacy(): ReactNode {
  return (
    <div style={{ background: "var(--background)", color: "var(--text)" }}>
      <PolicyLayout hostname="query.host" title="Privacy policy">
        <h2>What we collect</h2>
        <p>
          The playground sends the game, host, and port you enter to the
          QueryHost web service. We keep that request only long enough to answer
          it and to apply the ten-second result cache.
        </p>
        <h2>What we never collect</h2>
        <ul>
          <li>No accounts, cookies, or tracking pixels.</li>
          <li>No analytics on which servers you look up.</li>
        </ul>
      </PolicyLayout>
    </div>
  );
}
