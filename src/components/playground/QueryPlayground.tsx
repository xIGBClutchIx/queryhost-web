import { useCallback, useEffect, useRef, useState } from "react";
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
import { HOME_HEADLINE, HOME_SUMMARY } from "../../lib/site.js";
import { PlaygroundExamples } from "./PlaygroundExamples.js";
import { QueryForm } from "./QueryForm.js";
import { QueryResult } from "./QueryResult.js";
import { useDockHeight } from "./use-dock-height.js";
import { useFocusShortcut } from "./use-focus-shortcut.js";
import { usePlaygroundSession } from "./use-playground-session.js";
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
  const { output, runDetect, runQuery } = usePlaygroundSession(
    games,
    onAgentQuery,
  );
  const outputRef = useRevealOutput(output);
  useViewportFit(playgroundRef, output.kind);

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
          // The picker shows what was found, unless the person changed it meanwhile.
          setForm((current) =>
            current.game === "auto"
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
        <PlaygroundExamples
          examples={PLAYGROUND_EXAMPLES}
          games={games}
          onSelect={onExample}
        />
      )}

      <section
        className="query-output"
        id="query-output"
        ref={outputRef}
        aria-live="polite"
        aria-busy={loading}
      >
        <div className="query-loading" hidden={!loading}>
          <div className="query-loading__line query-loading__line--short" />
          <div className="query-loading__grid">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p>
            {output.kind === "loading" && output.detecting
              ? "Trying each supported game protocol…"
              : "Contacting the server through the selected game profile…"}
          </p>
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
            games={games}
            input={output.input}
            result={output.result}
          />
        )}
      </section>
    </section>
  );
}
