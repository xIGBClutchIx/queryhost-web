import type { ReactNode } from "react";
import { PolicyLayout } from "@queryhost/web";

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

export const Privacy = () => (
  <Page>
    <PolicyLayout title="Privacy policy" hostname="query.host">
      <p>
        QueryHost lets you query public game-server status through query.host
        and connected AI clients.
      </p>
      <h2>Information processed</h2>
      <p>
        QueryHost receives the game or protocol, hostname or public IP address,
        port, and supported query options you submit. Do not submit passwords,
        credentials, or private server configuration.
      </p>
    </PolicyLayout>
  </Page>
);
