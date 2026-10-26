import type { TargetedMouseEvent } from "preact";
import type { ReactNode } from "react";

import type { PlaygroundGameDefinition } from "../../lib/playground-contracts.js";
import { findGame } from "../../lib/playground-form.js";
import type { RecentCheck } from "../../lib/recent-checks.js";
import { resultFormSearch, resultPath } from "../../lib/result-url.js";

interface RecentChecksProps {
  readonly checks: readonly RecentCheck[];
  readonly games: readonly PlaygroundGameDefinition[];
  readonly onClear: () => void;
  /** Runs the check in place; the link remains the no-script fallback. */
  readonly onSelect: (search: string) => void;
}

/** Servers this browser checked recently, kept only in its own storage. */
export function RecentChecks({
  checks,
  games,
  onClear,
  onSelect,
}: RecentChecksProps): ReactNode {
  if (checks.length === 0) return null;

  function onClick(
    event: TargetedMouseEvent<HTMLAnchorElement>,
    search: string,
  ): void {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }
    event.preventDefault();
    onSelect(search);
  }

  return (
    <nav
      className="playground-examples playground-recent"
      id="playground-recent"
      aria-label="Your recent checks"
    >
      <span className="playground-examples__label">Recent</span>
      <ul>
        {checks.map((check) => {
          const game = findGame(games, check.game);
          const href = resultPath(check, game);
          const port =
            check.port === undefined || check.port === game?.defaultPort
              ? undefined
              : String(check.port);
          const parameters = new URLSearchParams();
          if (check.queryPort !== undefined) {
            parameters.set("queryPort", String(check.queryPort));
          }
          const search = resultFormSearch(
            check.game,
            port === undefined
              ? { host: check.host }
              : { host: check.host, port },
            parameters,
          );
          return (
            <li key={href}>
              <a
                className="playground-examples__chip"
                href={href}
                title={game?.name ?? check.game}
                onClick={(event) => {
                  onClick(event, search);
                }}
              >
                <span>
                  {port === undefined
                    ? check.host
                    : `${check.host.includes(":") ? `[${check.host}]` : check.host}:${port}`}
                </span>{" "}
                <code>{game?.name ?? check.game}</code>
              </a>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            className="playground-recent__clear"
            aria-label="Clear recent checks"
            onClick={onClear}
          >
            Clear
          </button>
        </li>
      </ul>
    </nav>
  );
}
