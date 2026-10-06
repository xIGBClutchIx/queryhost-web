import { useCallback, useRef, useState } from "react";
import type { ReactNode, SubmitEvent } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundQueryInput,
} from "../../lib/playground-contracts.js";
import {
  formQueryInput,
  formStateFromQueryInput,
  formStateFromSearch,
  initialFormState,
} from "../../lib/playground-form.js";
import type { PlaygroundFormState } from "../../lib/playground-form.js";
import { QueryForm } from "./QueryForm.js";
import { QueryResult } from "./QueryResult.js";
import { useDockHeight } from "./use-dock-height.js";
import { usePlaygroundSession } from "./use-playground-session.js";

interface QueryPlaygroundProps {
  /** Browser-safe registry projection serialized by the server. */
  readonly games: readonly PlaygroundGameDefinition[];
  /** Request query string, so shared links render prefilled on the server. */
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

  const onAgentQuery = useCallback((input: PlaygroundQueryInput) => {
    setFormError(undefined);
    setForm(formStateFromQueryInput(input));
  }, []);
  const { output, runQuery } = usePlaygroundSession(games, onAgentQuery);

  function onSubmit(event: SubmitEvent<HTMLFormElement>): void {
    event.preventDefault();
    setFormError(undefined);
    if (formRef.current?.reportValidity() === false) return;
    const parsed = formQueryInput(form);
    if (parsed.kind === "invalid") {
      setFormError(parsed.error);
      hostRef.current?.focus();
      return;
    }
    runQuery(parsed.input).catch(() => undefined);
  }

  const loading = output.kind === "loading";

  return (
    <section
      className="playground"
      aria-labelledby="query-heading"
      ref={playgroundRef}
    >
      <div className="playground__heading">
        <h1 id="query-heading">Query a server</h1>
        <p>Enter a public game server address to get its current status.</p>
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

      <section
        className="query-output"
        id="query-output"
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
          <p>Contacting the server through the selected game profile…</p>
        </div>

        {output.kind === "error" && (
          <div className="query-request-error" id="query-request-error">
            <p className="eyebrow">{output.code}</p>
            <h2>The query could not be sent.</h2>
            <p>{output.message}</p>
          </div>
        )}

        {output.kind === "result" && (
          <QueryResult key={output.id} games={games} result={output.result} />
        )}
      </section>
    </section>
  );
}
