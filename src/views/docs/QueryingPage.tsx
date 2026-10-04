import type { ReactNode } from "react";

import { Callout } from "../../components/Callout.js";
import { CodeBlock } from "../../components/CodeBlock.js";
import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import type { PageProps } from "../page-props.js";
import { aliasesForGame, GAMES } from "../../lib/queryhost.js";

export const metadata = {
  activeHref: "/querying/",
  eyebrow: "Core library",
  title: "Query a server",
  description:
    "Choose a game profile and let QueryHost apply its protocol, discovery, port, and safety rules.",
} as const satisfies DocsPageMetadata;

const fullQuery = `const result = await query({
  game: "minecraft-java",
  host: "play.example.com",
  mode: "full",
  timeoutMs: 5000,
});`;

export function QueryingPage({ hostname }: PageProps): ReactNode {
  return (
    <DocsLayout {...metadata} hostname={hostname}>
      <h2 id="input">Query input</h2>
      <table className="data-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>Required</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>game</code>
            </td>
            <td>Yes</td>
            <td>Canonical game ID or accepted alias.</td>
          </tr>
          <tr>
            <td>
              <code>host</code>
            </td>
            <td>Yes</td>
            <td>DNS hostname or IP literal. URL syntax is rejected.</td>
          </tr>
          <tr>
            <td>
              <code>port</code>
            </td>
            <td>No*</td>
            <td>
              Game or service port. The registry default is used when omitted.
            </td>
          </tr>
          <tr>
            <td>
              <code>queryPort</code>
            </td>
            <td>No</td>
            <td>
              Explicit protocol query destination when it differs from the game
              port.
            </td>
          </tr>
          <tr>
            <td>
              <code>mode</code>
            </td>
            <td>No</td>
            <td>
              <code>summary</code> skips optional enrichment; <code>full</code>{" "}
              requests it.
            </td>
          </tr>
          <tr>
            <td>
              <code>timeoutMs</code>
            </td>
            <td>No</td>
            <td>
              Global deadline from 1 through 30,000 ms; defaults to 5,000 ms.
            </td>
          </tr>
          <tr>
            <td>
              <code>signal</code>
            </td>
            <td>No</td>
            <td>Caller cancellation propagated to outstanding operations.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Generic <code>a2s</code> queries require <code>port</code>, which is the
        actual A2S query destination. They do not accept <code>queryPort</code>.
        Named profiles retain their normal game-port defaults and query-port
        conventions.
      </p>
      <CodeBlock
        code={fullQuery}
        label="Full Minecraft Java query"
        language="TypeScript"
      />
      <h2 id="ports">Game and query ports</h2>
      <p>
        <code>port</code> represents the normal game or service port. A profile
        can derive a conventional query destination from it. Rust, for example,
        maps game port 28015 to query port 28017. An explicit{" "}
        <code>queryPort</code> always wins.
      </p>
      <Callout title="Minecraft Java discovery">
        <p>
          When the host is a DNS name and <code>port</code> is omitted,
          Minecraft Java may discover an SRV destination. Supplying an explicit
          port or IP literal bypasses SRV.
        </p>
      </Callout>
      <h2 id="aliases">Accepted game aliases</h2>
      <p>
        Aliases are input conveniences. Successful and failed results always use
        the canonical ID.
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>Game</th>
            <th>Canonical ID</th>
            <th>Aliases</th>
          </tr>
        </thead>
        <tbody>
          {GAMES.map((game) => {
            const aliases = aliasesForGame(game.id);
            return (
              <tr key={game.id}>
                <td>{game.name}</td>
                <td>
                  <code>{game.id}</code>
                </td>
                <td>
                  {aliases.length === 0
                    ? "None"
                    : aliases.map((alias) => <code key={alias}>{alias}</code>)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <h2 id="live">Live by default</h2>
      <p>
        The library performs live network work for every call. It has no hidden
        cache. Applications that need caching must add it explicitly outside
        QueryHost.
      </p>
    </DocsLayout>
  );
}
