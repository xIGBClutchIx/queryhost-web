import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { TargetedSubmitEvent } from "preact";
import type { ReactNode } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "../../lib/playground-contracts.js";
import { PLAYGROUND_EXAMPLES } from "../../lib/playground-examples.js";
import {
  detectedFormState,
  findGame,
  formQueryInput,
  formStateFromQueryInput,
  formStateFromSearch,
  initialFormState,
  isCompleteSharedQuery,
} from "../../lib/playground-form.js";
import type { PlaygroundFormState } from "../../lib/playground-form.js";
import { formatPlayerCount } from "../../lib/player-count.js";
import {
  sourceProgressItems,
  type SourceProgressEntry,
} from "../../lib/query-path.js";
import {
  notifyRecentChecks,
  parseRecentChecks,
  recentChecksSnapshot,
  saveRecentChecks,
  subscribeRecentChecks,
  withRecentCheck,
} from "../../lib/recent-checks.js";
import { HOME_HEADLINE, HOME_SUMMARY } from "../../lib/site.js";
import { PlaygroundExamples } from "./PlaygroundExamples.js";
import { QueryForm } from "./QueryForm.js";
import { QueryResult } from "./QueryResult.js";
import { RecentChecks } from "./RecentChecks.js";
import { useDockHeight } from "./use-dock-height.js";
import { useFocusShortcut } from "./use-focus-shortcut.js";
import { usePlaygroundSession } from "./use-playground-session.js";
import type { OutputState } from "./use-playground-session.js";
import { useRevealOutput } from "./use-reveal-output.js";
import { useViewportFit } from "./use-viewport-fit.js";
import "../../styles/playground.css";

interface QueryPlaygroundProps {
  /** Browser-safe registry projection serialized by the server. */
  readonly games: readonly PlaygroundGameDefinition[];
  /**
   * The query in form-parameter shape (`?game=&host=&port=`), so result pages
   * and shared links render prefilled on the server.
   */
  readonly search: string;
}

/** The interactive playground island; the rest of every page is static HTML. */
export function QueryPlayground({
  games,
  search,
}: QueryPlaygroundProps): ReactNode {
  const [form, setForm] = useState<PlaygroundFormState>(() =>
    formStateFromSearch(search, games, initialFormState(games)),
  );
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);
  const { dockRef, playgroundRef } = useDockHeight();
  useFocusShortcut(hostRef);

  const onAgentQuery = useCallback((input: PlaygroundQueryInput) => {
    setFormError(undefined);
    setForm(formStateFromQueryInput(input));
  }, []);
  const { cancel, output, runDetect, runQuery } = usePlaygroundSession(
    games,
    onAgentQuery,
  );
  const outputRef = useRevealOutput(output);
  useViewportFit(playgroundRef, output.kind);
  const onRefresh = useCallback(
    (input: PlaygroundQueryInput) => {
      runQuery(input).catch(() => undefined);
    },
    [runQuery],
  );

  // The list lives in this browser's storage. The server renders none, so the
  // hydrating render must too; the list appears once the island has mounted.
  const mounted = useRef(false);
  const readRecentChecks = useCallback(
    () => (mounted.current ? recentChecksSnapshot() : null),
    [],
  );
  const recentText = useSyncExternalStore(
    subscribeRecentChecks,
    readRecentChecks,
  );
  useEffect(() => {
    mounted.current = true;
    notifyRecentChecks();
    return () => {
      mounted.current = false;
    };
  }, []);
  const recentChecks = useMemo(
    () => parseRecentChecks(recentText, games),
    [games, recentText],
  );
  // Only servers that answered are remembered, which keeps typos out.
  useEffect(() => {
    if (output.kind !== "result" || !output.result.ok) return;
    saveRecentChecks(
      withRecentCheck(
        parseRecentChecks(recentChecksSnapshot(), games),
        output.input,
      ),
    );
  }, [games, output]);
  const clearRecentChecks = useCallback(() => {
    saveRecentChecks([]);
    hostRef.current?.focus();
  }, []);

  function submit(next: PlaygroundFormState): void {
    setFormError(undefined);
    const parsed = formQueryInput(next);
    if (parsed.kind === "invalid") {
      setFormError(parsed.error);
      hostRef.current?.focus();
      return;
    }
    if (parsed.kind === "detect") {
      runDetect(parsed.input).then(
        (detected) => {
          const game =
            detected === undefined ? undefined : findGame(games, detected.game);
          if (detected === undefined || game === undefined) return;
          // The picker shows what was found, unless the person edited the
          // detection's target or choices while it ran.
          setForm((current) =>
            current.game === "auto" &&
            current.host === next.host &&
            current.port === next.port &&
            current.mode === next.mode &&
            current.timeoutMs === next.timeoutMs
              ? detectedFormState(current, detected, game)
              : current,
          );
        },
        () => undefined,
      );
      return;
    }
    runQuery(parsed.input).catch(() => undefined);
  }

  function onSubmit(event: TargetedSubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    // The submit button stays focusable while a query runs, so it ignores presses.
    if (output.kind === "loading") return;
    setFormError(undefined);
    if (formRef.current?.reportValidity() === false) return;
    submit(form);
  }

  function onExample(exampleSearch: string): void {
    const next = formStateFromSearch(
      exampleSearch,
      games,
      initialFormState(games),
    );
    setForm(next);
    submit(next);
  }

  // A complete shared link, including a refresh after a query, runs exactly once per
  // page load. Incomplete or invalid links stay prefilled and wait for a submit.
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (!isCompleteSharedQuery(search, games)) return;
    if (formRef.current?.checkValidity() === false) return;
    const parsed = formQueryInput(
      formStateFromSearch(search, games, initialFormState(games)),
    );
    if (parsed.kind === "valid") {
      runQuery(parsed.input).catch(() => undefined);
    }
  }, [games, runQuery, search]);

  const loading = output.kind === "loading";

  return (
    <section
      className="playground"
      aria-labelledby="query-heading"
      ref={playgroundRef}
    >
      <div className="playground__heading">
        <h1 id="query-heading">{HOME_HEADLINE}</h1>
        <p>{HOME_SUMMARY}</p>
      </div>

      <div className="query-form-dock" ref={dockRef}>
        <QueryForm
          error={formError}
          form={form}
          formRef={formRef}
          games={games}
          hostRef={hostRef}
          loading={loading}
          onFormChange={setForm}
          onSubmit={onSubmit}
        />
      </div>

      {output.kind === "idle" && (
        <>
          <PlaygroundExamples
            examples={PLAYGROUND_EXAMPLES}
            games={games}
            onSelect={onExample}
          />
          <RecentChecks
            checks={recentChecks}
            games={games}
            onClear={clearRecentChecks}
            onSelect={onExample}
          />
          <p className="playground-coverage" id="playground-coverage">
            {games.filter((game) => game.id !== "a2s").length} games plus any
            Steam A2S server. <a href="/docs/games/">Browse supported games</a>
          </p>
        </>
      )}

      <p className="sr-only" role="status" id="query-announcement">
        {outputAnnouncement(output)}
      </p>

      <section
        className="query-output"
        id="query-output"
        ref={outputRef}
        aria-label="Query result"
        aria-busy={loading}
      >
        <div className="query-loading" hidden={!loading}>
          <button
            type="button"
            className="query-loading__cancel"
            id="query-cancel"
            onClick={() => {
              cancel();
              hostRef.current?.focus();
            }}
          >
            Cancel
          </button>
          <div className="query-loading__line query-loading__line--short" />
          <div className="query-loading__grid">
            <span />
            <span />
            <span />
            <span />
          </div>
          <QueryProgress
            detecting={output.kind === "loading" && output.detecting}
            progress={output.kind === "loading" ? output.progress : []}
          />
        </div>

        {output.kind === "error" && (
          <div className="query-request-error" id="query-request-error">
            <p className="eyebrow">{output.code}</p>
            <h2>{output.heading ?? "The query could not be sent."}</h2>
            <p>{output.message}</p>
          </div>
        )}

        {output.kind === "result" && (
          <QueryResult
            key={output.id}
            detected={output.detected}
            games={games}
            input={output.input}
            onRefresh={onRefresh}
            result={output.result}
          />
        )}
      </section>
    </section>
  );
}

/**
 * One short line for screen readers per outcome, so assistive technology hears the
 * result without reading every row, tab, and warning of the output region.
 */
function outputAnnouncement(output: OutputState): string {
  switch (output.kind) {
    case "idle":
    case "loading":
      return "";
    case "error":
      return `${output.heading ?? "The query could not be sent."} ${output.message}`;
    case "result": {
      const { result } = output;
      if (!result.ok) {
        return `Offline or unreachable. ${result.error.message}`;
      }
      const status = result.partial ? "Online with partial data." : "Online.";
      const players = result.server.players;
      return players === undefined
        ? status
        : `${status} ${formatPlayerCount(players)} players.`;
    }
  }
}

/** A quiet line naming each source as the running query reports it. */
function QueryProgress({
  detecting,
  progress,
}: {
  readonly detecting: boolean;
  readonly progress: readonly SourceProgressEntry[];
}): ReactNode {
  const items = sourceProgressItems(progress);
  if (items.length === 0) {
    return (
      <p>
        {detecting
          ? "Trying each supported game protocol…"
          : "Contacting the server through the selected game profile…"}
      </p>
    );
  }
  return (
    <ol className="query-loading__sources" aria-label="Query progress">
      {items.map((item) => (
        <li
          key={item.source}
          className={`query-loading__source query-loading__source--${item.state}`}
          title={item.source}
        >
          <span className="query-loading__dot" aria-hidden="true" />
          {item.label}
          <code>{item.detail}</code>
        </li>
      ))}
    </ol>
  );
}
