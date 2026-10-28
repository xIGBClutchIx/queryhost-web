import { useEffect, useRef } from "react";
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
  /** Forgets one check; the caller moves focus once the list is empty. */
  readonly onRemove: (check: RecentCheck) => void;
  /** Runs the check in place; the link remains the no-script fallback. */
  readonly onSelect: (search: string) => void;
}

/** Servers this browser checked recently, kept only in its own storage. */
export function RecentChecks({
  checks,
  games,
  onClear,
  onRemove,
  onSelect,
}: RecentChecksProps): ReactNode {
  const listRef = useRef<HTMLUListElement>(null);
  // The removed check's position, so focus stays in the list at its neighbor.
  const removedIndex = useRef<number | undefined>(undefined);

  useEffect(() => {
    const index = removedIndex.current;
    removedIndex.current = undefined;
    if (index === undefined) return;
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>(
      ".playground-recent__remove",
    );
    if (buttons === undefined || buttons.length === 0) return;
    buttons[Math.min(index, buttons.length - 1)]?.focus();
  }, [checks]);

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
      <ul ref={listRef}>
        {checks.map((check, index) => {
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
          const address =
            port === undefined
              ? check.host
              : `${check.host.includes(":") ? `[${check.host}]` : check.host}:${port}`;
          // Stored checks are normalized and unique, so their links are too.
          return (
            <li key={href} className="playground-recent__item">
              <a
                className="playground-examples__chip"
                href={href}
                title={game?.name ?? check.game}
                onClick={(event) => {
                  onClick(event, search);
                }}
              >
                <span>{address}</span> <code>{game?.name ?? check.game}</code>
              </a>
              <button
                type="button"
                className="playground-recent__remove"
                aria-label={`Remove ${address} from recent checks`}
                title="Remove"
                onClick={() => {
                  removedIndex.current = index;
                  onRemove(check);
                }}
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
                </svg>
              </button>
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
