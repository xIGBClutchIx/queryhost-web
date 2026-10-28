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
  PlaygroundDetectInput,
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
  splitAddress,
  withSplitHost,
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
  withoutRecentCheck,
  withRecentCheck,
} from "../../lib/recent-checks.js";
import type { RecentCheck } from "../../lib/recent-checks.js";
import { resultPath } from "../../lib/result-url.js";
import { HOME_HEADLINE, HOME_SUMMARY } from "../../lib/site.js";
import { PlaygroundExamples } from "./PlaygroundExamples.js";
import { QueryForm } from "./QueryForm.js";
import { QueryResult } from "./QueryResult.js";
import type { ResultTab } from "./QueryResult.js";
import { RecentChecks } from "./RecentChecks.js";
import { useDockHeight } from "./use-dock-height.js";
import { useFocusShortcut } from "./use-focus-shortcut.js";
import { usePlaygroundSession } from "./use-playground-session.js";
import type { OutputState, QueryAttempt } from "./use-playground-session.js";
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

/**
 * Where focus goes when a query started from a control that the loading view
 * replaces: the result's refresh button, or the output region.
 */
type FocusReturn = "output" | "refresh";

/** The result tab someone chose, and the target it was chosen for. */
interface ChosenTab {
  readonly tab: ResultTab;
  readonly target: string;
}

/** Whether focus has fallen back to the page, as when its control unmounted. */
function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
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
  const cancelRef = useRef<HTMLButtonElement>(null);
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
  const focusReturn = useRef<FocusReturn | undefined>(undefined);
  const onRefresh = useCallback(
    (input: PlaygroundQueryInput) => {
      focusReturn.current = "refresh";
      runQuery(input).catch(() => undefined);
    },
    [runQuery],
  );

  // A refresh shows a new result for the same target, which keeps its tab.
  const [chosenTab, setChosenTab] = useState<ChosenTab | undefined>(undefined);
  const resultTarget =
    output.kind === "result"
      ? resultPath(output.input, findGame(games, output.input.game))
      : undefined;
  const onTabChange = useCallback(
    (tab: ResultTab) => {
      if (resultTarget !== undefined) {
        setChosenTab({ tab, target: resultTarget });
      }
    },
    [resultTarget],
  );
  const resultTab =
    chosenTab !== undefined && chosenTab.target === resultTarget
      ? chosenTab.tab
      : "overview";

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
        games,
      ),
    );
  }, [games, output]);
  const clearRecentChecks = useCallback(() => {
    saveRecentChecks([]);
    hostRef.current?.focus();
  }, []);
  const removeRecentCheck = useCallback(
    (check: RecentCheck) => {
      const next = withoutRecentCheck(
        parseRecentChecks(recentChecksSnapshot(), games),
        check,
      );
      saveRecentChecks(next);
      if (next.length === 0) hostRef.current?.focus();
    },
    [games],
  );

  // The form a detection started from, so Try again can run it once more.
  const detectForm = useRef<PlaygroundFormState | undefined>(undefined);

  function detect(
    input: PlaygroundDetectInput,
    next: PlaygroundFormState,
  ): void {
    detectForm.current = next;
    runDetect(input).then(
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
  }

  function submit(submitted: PlaygroundFormState): void {
    setFormError(undefined);
    // A pasted `host:port` shows up split, the way it is queried.
    const next = withSplitHost(submitted);
    if (next !== submitted) setForm(next);
    const parsed =
      splitAddress(submitted.host) === undefined
        ? ({
            error:
              "Enter a hostname or IP address, with an optional :port and nothing more.",
            kind: "invalid",
          } as const)
        : formQueryInput(next);
    if (parsed.kind === "invalid") {
      setFormError(parsed.error);
      hostRef.current?.focus();
      return;
    }
    if (parsed.kind === "detect") {
      detect(parsed.input, next);
      return;
    }
    runQuery(parsed.input).catch(() => undefined);
  }

  function retry(attempt: QueryAttempt): void {
    focusReturn.current = "output";
    if (attempt.kind === "query") {
      runQuery(attempt.input).catch(() => undefined);
    } else {
      detect(attempt.input, detectForm.current ?? form);
    }
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
    focusReturn.current = "output";
    setForm(next);
    submit(next);
  }

  // A chip, refresh, or Try again control is replaced by the loading view, so
  // focus waits on Cancel and then moves to what replaced the control. Focus
  // someone already moved elsewhere, like back into the form, stays put.
  useEffect(() => {
    const target = focusReturn.current;
    if (target === undefined) return;
    if (output.kind === "loading") {
      if (focusLost()) cancelRef.current?.focus();
      return;
    }
    focusReturn.current = undefined;
    if (!focusLost() && document.activeElement !== cancelRef.current) return;
    const refresh =
      target === "refresh"
        ? document.getElementById("query-result-refresh")
        : null;
    (refresh ?? outputRef.current)?.focus({ preventScroll: true });
  }, [output.kind, outputRef]);

  const loading = output.kind === "loading";

  const cancelQuery = useCallback(() => {
    cancel();
    hostRef.current?.focus();
  }, [cancel]);

  // Escape abandons a running query, unless something open, like a listbox or
  // a dialog, claims the key first.
  useEffect(() => {
    if (!loading) return;
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("dialog, [role='dialog']") !== null
      ) {
        return;
      }
      event.preventDefault();
      // Focus on Cancel or nowhere returns to the host field, as Cancel does.
      const active = document.activeElement;
      if (focusLost() || active === cancelRef.current) cancelQuery();
      else cancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [cancel, cancelQuery, loading]);

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

  // Examples and recent checks lead the idle page and follow a finished
  // result or error, so another server is always one step away.
  const discovery = (
    <div className="playground-discovery" id="playground-discovery">
      <PlaygroundExamples
        examples={PLAYGROUND_EXAMPLES}
        games={games}
        onSelect={onExample}
      />
      <RecentChecks
        checks={recentChecks}
        games={games}
        onClear={clearRecentChecks}
        onRemove={removeRecentCheck}
        onSelect={onExample}
      />
      <p className="playground-coverage" id="playground-coverage">
        {games.filter((game) => game.id !== "a2s").length} games plus any Steam
        A2S server. <a href="/docs/games/">Browse supported games</a>
      </p>
    </div>
  );

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

      {output.kind === "idle" && discovery}

      <p className="sr-only" role="status" id="query-announcement">
        {outputAnnouncement(output)}
      </p>

      <section
        className="query-output"
        id="query-output"
        ref={outputRef}
        aria-label="Query result"
        aria-busy={loading}
        tabIndex={-1}
      >
        <div className="query-loading" hidden={!loading}>
          <button
            type="button"
            className="query-loading__cancel"
            id="query-cancel"
            ref={cancelRef}
            aria-keyshortcuts="Escape"
            onClick={cancelQuery}
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
            <p className="query-request-error__message">{output.message}</p>
            <button
              type="button"
              className="query-request-error__retry"
              id="query-retry"
              onClick={() => {
                retry(output.attempt);
              }}
            >
              Try again
            </button>
          </div>
        )}

        {output.kind === "result" && (
          <QueryResult
            key={output.id}
            detected={output.detected}
            games={games}
            input={output.input}
            onRefresh={onRefresh}
            onTabChange={onTabChange}
            result={output.result}
            tab={resultTab}
          />
        )}
      </section>

      {(output.kind === "result" || output.kind === "error") && discovery}
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
      return "";
    case "loading":
      return `Querying ${output.host}…`;
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
