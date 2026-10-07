import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import {
  aliasesForGame,
  CAPABILITY_LABELS,
  GAMES,
  SUPPORT_LABELS,
} from "../../lib/queryhost.js";

export const metadata = {
  activeHref: "/games/",
  eyebrow: "Package registry",
  title: "Supported games",
  description:
    "Every game and capability below is rendered directly from the QueryHost package registry.",
  wide: true,
} as const satisfies DocsPageMetadata;

const CAPABILITIES = Object.entries(CAPABILITY_LABELS) as readonly (readonly [
  keyof typeof CAPABILITY_LABELS,
  string,
])[];
const SUPPORT_LEVELS = ["supported", "conditional", "unsupported"] as const;

/** Lowercase text the client-side filter matches: name, canonical ID, and aliases. */
function filterText(game: (typeof GAMES)[number]): string {
  return [game.name, game.id, ...aliasesForGame(game.id)]
    .join(" ")
    .toLowerCase();
}

export function GamesPage(): ReactNode {
  return (
    <DocsLayout {...metadata}>
      <div className="capability-overview">
        <p>
          Required sources are supported. Conditional data depends on optional
          enrichment or what the server advertises.
        </p>
        <div
          className="capability-legend"
          aria-label="Capability availability legend"
        >
          {SUPPORT_LEVELS.map((support) => (
            <span key={support} className={`status status--${support}`}>
              {SUPPORT_LABELS[support]}
            </span>
          ))}
        </div>
      </div>
      {/* Revealed by the shared page script; without it the full table stays visible. */}
      <div className="capability-filter" data-game-filter-control="" hidden>
        <label htmlFor="capability-filter-input">Filter games</label>
        <input
          id="capability-filter-input"
          type="search"
          placeholder="Name, ID, or alias"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="capability-filter-status"
        />
        <span
          id="capability-filter-status"
          className="capability-filter__status"
          data-game-filter-status=""
          aria-live="polite"
        />
      </div>
      <p className="capability-filter__empty" data-game-filter-empty="" hidden>
        No games match that filter.
      </p>
      <div className="capability-table-scroll">
        <table className="data-table capability-table">
          <caption className="sr-only">
            Supported games, ports, and capability availability
          </caption>
          <thead>
            <tr className="capability-table__groups">
              <th scope="col" rowSpan={2}>
                <span className="capability-table__game-group">Game</span>{" "}
                <span className="capability-table__game-label">ID</span>
              </th>
              <th scope="colgroup" colSpan={2}>
                Ports
              </th>
              <th scope="colgroup" colSpan={3}>
                Core
              </th>
              <th scope="colgroup" colSpan={3}>
                Content
              </th>
              <th scope="colgroup">Discovery</th>
            </tr>
            <tr>
              <th scope="col">Game</th>
              <th scope="col">Query</th>
              {CAPABILITIES.map(([capability, label]) => (
                <th scope="col" key={capability}>
                  {capability === "summary"
                    ? "Info"
                    : capability === "srv"
                      ? "SRV"
                      : label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {GAMES.map((game) => (
              <tr key={game.id} data-game-filter={filterText(game)}>
                <th scope="row" className="capability-table__game">
                  <strong>{game.name}</strong> <code>{game.id}</code>
                </th>
                <td className="capability-table__port">
                  {game.defaultPort ?? "Required"}
                </td>
                <td className="capability-table__port">
                  {game.defaultQueryPort ?? (
                    <span aria-label="Not applicable">—</span>
                  )}
                </td>
                {CAPABILITIES.map(([capability]) => {
                  const support = game.capabilities[capability];
                  return (
                    <td className="capability-table__support" key={capability}>
                      <span
                        className={`capability-symbol capability-symbol--${support}`}
                        title={SUPPORT_LABELS[support]}
                      >
                        {support === "supported" && (
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <path d="m3.5 8.3 2.8 2.8 6.2-6.2" />
                          </svg>
                        )}{" "}
                        {support === "conditional" && (
                          <svg viewBox="0 0 16 16" aria-hidden="true">
                            <circle cx="8" cy="8" r="5.25" />
                            <path d="M5.5 8h5" />
                          </svg>
                        )}{" "}
                        {support === "unsupported" && (
                          <span aria-hidden="true">—</span>
                        )}{" "}
                        <span className="sr-only">
                          {SUPPORT_LABELS[support]}
                        </span>
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DocsLayout>
  );
}
