import type { ReactNode } from "react";

import { PolicyLayout } from "../components/PolicyLayout.js";

export const metadata = {
  title: "Privacy policy",
  description:
    "How QueryHost processes game-server queries and operational information.",
} as const;

export function PrivacyPage(): ReactNode {
  return (
    <PolicyLayout title={metadata.title}>
      <p>
        QueryHost lets you query public game-server status through query.host
        and connected AI clients.
      </p>
      <h2>Information processed</h2>
      <p>
        QueryHost receives the game or protocol, hostname or public IP address,
        port, and supported query options you submit. Our servers resolve and
        contact the requested public target and process its status response.
        Responses may include server names, messages, versions, maps, and public
        player information. Do not submit passwords, credentials, or private
        server configuration.
      </p>
      <p>
        When used through ChatGPT or another MCP client, QueryHost receives the
        tool arguments and protocol messages that client sends. It does not
        require a QueryHost account or request access to your chat history.
        Results are returned to that client; its own privacy policy governs its
        handling of conversations and results.
      </p>
      <h2>Purpose and recipients</h2>
      <p>
        We process these inputs to perform the requested query, compare results,
        return server cards and links, and keep the service reliable and
        protected against abuse. QueryHost uses Railway to host its services.
        The selected game server receives a network query from QueryHost
        infrastructure. Its operator may log that connection under its own
        practices.
      </p>
      <h2>Storage and operational logs</h2>
      <p>
        The query service uses a bounded, short-lived in-memory result cache to
        reduce repeated network work. It does not provide saved query accounts
        or a persistent query-history database. The API records operational
        events such as request identifiers, method, route, response status,
        duration, game, and cache outcome. Hosting and network infrastructure
        may also process connection metadata and access logs. Operational logs
        are retained under the hosting providers' configured retention policies.
        We do not promise that requests leave no logs. Contact us for
        information about logs associated with a particular request.
      </p>
      <h2>Contact and requests</h2>
      <p>
        Email{" "}
        <a href="mailto:lockerzmodding@gmail.com">lockerzmodding@gmail.com</a>{" "}
        about access, correction, or deletion of information we hold about you.
        Please identify the relevant request without sending passwords or
        unrelated sensitive information.
      </p>
      <h2>Changes</h2>
      <p>
        We will update this page and its effective date when our data practices
        change.
      </p>
    </PolicyLayout>
  );
}
