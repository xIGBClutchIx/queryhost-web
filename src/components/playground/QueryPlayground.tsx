import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { SubmitEvent, ReactNode } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import {
  findGame,
  formQueryInput,
  formStateFromQueryInput,
  formStateFromSearch,
  gameFields,
  initialFormState,
  selectGame,
  shareUrl,
} from "../../lib/playground-form.js";
import type {
  PlaygroundFormState,
  PlaygroundTimeout,
} from "../../lib/playground-form.js";
import { requestPlaygroundQuery } from "../../lib/playground-query.js";
import { PlaygroundRequestCoordinator } from "../../lib/playground-request-coordinator.js";
import type { WebMcpRegistration } from "../../lib/webmcp.js";
import { CustomSelect } from "./CustomSelect.js";
import type { SelectOption } from "./CustomSelect.js";
import { QueryResult } from "./QueryResult.js";

type QueryOutcome = PlaygroundProxyErrorResponse | PlaygroundQueryResponse;

type OutputState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | {
      readonly code: string;
      readonly kind: "error";
      readonly message: string;
    }
  | {
      readonly id: number;
      readonly kind: "result";
      readonly raw: string;
      readonly result: PlaygroundQueryResponse;
    };

/** Resources owned while the page is live; bfcache restores start a new session. */
interface PlaygroundSession {
  readonly controller: AbortController;
  readonly coordinator: PlaygroundRequestCoordinator;
}

const MODE_OPTIONS: readonly SelectOption<"full" | "summary">[] = [
  { label: "Full details", value: "full" },
  { label: "Summary only", value: "summary" },
];

const TIMEOUT_OPTIONS: readonly SelectOption<PlaygroundTimeout>[] = [
  { label: "3 seconds", value: "3000" },
  { label: "5 seconds", value: "5000" },
];

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

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
  const [output, setOutput] = useState<OutputState>({ kind: "idle" });
  const playgroundRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hostRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<PlaygroundSession | undefined>(undefined);
  const resultSequence = useRef(0);

  const game = findGame(games, form.game);
  if (game === undefined) {
    throw new Error("The selected game is not in the package registry.");
  }
  const fields = gameFields(game);
  const gameOptions = games.map((candidate) => ({
    label: candidate.name,
    value: candidate.id,
  }));

  const runQuery = useCallback(
    async (
      input: PlaygroundQueryInput,
      executionSignal?: AbortSignal,
    ): Promise<QueryOutcome> => {
      const session = sessionRef.current;
      if (session === undefined) {
        throw abortError("The playground is not active.");
      }
      setFormError(undefined);
      const request = session.coordinator.start(executionSignal);
      history.replaceState(
        history.state,
        "",
        shareUrl(window.location.href, input),
      );
      setOutput({ kind: "loading" });

      try {
        const response = await requestPlaygroundQuery(input, request.signal);
        if (!request.isCurrent()) {
          throw abortError("The query was superseded.");
        }
        if (response.kind === "proxy-error") {
          setOutput({ kind: "error", ...response.body.error });
          return response.body;
        }
        resultSequence.current += 1;
        setOutput({
          id: resultSequence.current,
          kind: "result",
          raw: response.raw,
          result: response.body,
        });
        return response.body;
      } catch (error) {
        if (!request.isCurrent()) {
          throw abortError("The query was cancelled.");
        }
        if (request.signal.aborted) {
          setOutput({ kind: "idle" });
          throw abortError("The query was cancelled.");
        }
        const failure: PlaygroundProxyErrorResponse = {
          error: {
            code: "NETWORK_ERROR",
            message:
              error instanceof Error
                ? error.message
                : "The browser could not reach the QueryHost web service.",
          },
        };
        setOutput({ kind: "error", ...failure.error });
        return failure;
      }
    },
    [],
  );

  // Owns requests and WebMCP tools for the page's lifetime, including bfcache exits.
  useEffect(() => {
    let registration: WebMcpRegistration | undefined;

    function start(): void {
      if (sessionRef.current !== undefined) return;
      const controller = new AbortController();
      sessionRef.current = {
        controller,
        coordinator: new PlaygroundRequestCoordinator(controller.signal),
      };
      // Agent tooling, including its schema library, loads only in WebMCP browsers.
      if (document.modelContext === undefined) return;
      void import("../../lib/webmcp.js").then(
        ({ registerQueryHostWebMcp }) => {
          if (controller.signal.aborted) return;
          registration = registerQueryHostWebMcp(document, games, {
            queryGameServer: (input, signal) => {
              setForm(formStateFromQueryInput(input));
              return runQuery(input, signal);
            },
          });
          void registration?.ready.catch(() => {
            console.warn("QueryHost could not register its WebMCP tools.");
          });
        },
        () => {
          console.warn("QueryHost could not load its WebMCP tools.");
        },
      );
    }

    function stop(): void {
      const session = sessionRef.current;
      if (session === undefined) return;
      sessionRef.current = undefined;
      session.controller.abort();
      registration?.abort();
      registration = undefined;
      // An interrupted query must not leave a restored page stuck in its loading state.
      setOutput((current) =>
        current.kind === "loading" ? { kind: "idle" } : current,
      );
    }

    function restore(event: PageTransitionEvent): void {
      if (event.persisted) start();
    }

    start();
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("pageshow", restore);
      stop();
    };
  }, [games, runQuery]);

  // The sticky result header sits below the form dock, whose height changes with layout.
  useLayoutEffect(() => {
    const dock = dockRef.current;
    const playground = playgroundRef.current;
    if (dock === null || playground === null) return;
    function syncDockHeight(): void {
      if (dock === null || playground === null) return;
      playground.style.setProperty(
        "--query-dock-height",
        `${dock.getBoundingClientRect().height}px`,
      );
    }
    const observer = new ResizeObserver(syncDockHeight);
    observer.observe(dock);
    syncDockHeight();
    return () => {
      observer.disconnect();
    };
  }, []);

  function update(changes: Partial<PlaygroundFormState>): void {
    setForm((current) => ({ ...current, ...changes }));
  }

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
        <form
          className="query-form"
          id="query-form"
          ref={formRef}
          onSubmit={onSubmit}
        >
          <div className="query-form__primary">
            <CustomSelect
              id="query-game"
              name="game"
              label="Game"
              options={gameOptions}
              value={form.game}
              required
              onChange={(id) => {
                const next = findGame(games, id);
                if (next !== undefined) {
                  setForm((current) =>
                    selectGame(current, findGame(games, current.game), next),
                  );
                }
              }}
            />

            <label className="field field--host">
              <span>Host or IP</span>
              <input
                id="query-host"
                ref={hostRef}
                name="host"
                type="text"
                required
                maxLength={253}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="play.example.com"
                value={form.host}
                onChange={(event) => {
                  update({ host: event.currentTarget.value });
                }}
              />
            </label>

            <label className="field">
              <span id="query-port-label">{fields.portLabel}</span>
              <input
                id="query-port"
                name="port"
                type="number"
                min="1"
                max="65535"
                inputMode="numeric"
                required={fields.portRequired}
                value={form.port}
                onChange={(event) => {
                  update({ port: event.currentTarget.value });
                }}
              />
            </label>

            <button
              className="query-submit"
              id="query-submit"
              type="submit"
              disabled={loading}
            >
              {loading ? "Querying…" : "Query"}
            </button>
          </div>

          <div
            className={
              form.advancedOpen
                ? "query-form__advanced is-open"
                : "query-form__advanced"
            }
            id="query-advanced"
          >
            <button
              className="query-form__advanced-trigger"
              id="query-advanced-trigger"
              type="button"
              aria-expanded={form.advancedOpen}
              aria-controls="query-advanced-content"
              onClick={() => {
                update({ advancedOpen: !form.advancedOpen });
              }}
            >
              Advanced options
            </button>
            <div
              className="query-form__advanced-content"
              id="query-advanced-content"
              aria-hidden={!form.advancedOpen}
              inert={!form.advancedOpen}
            >
              <div className="query-form__advanced-content-inner">
                <div className="query-form__secondary">
                  <label
                    className="field field--compact"
                    id="query-query-port-field"
                    hidden={!fields.queryPortAvailable}
                  >
                    <span>Query port</span>
                    <input
                      id="query-query-port"
                      name="queryPort"
                      type="number"
                      min="1"
                      max="65535"
                      inputMode="numeric"
                      placeholder={fields.queryPortPlaceholder}
                      disabled={!fields.queryPortAvailable}
                      value={form.queryPort}
                      onChange={(event) => {
                        update({ queryPort: event.currentTarget.value });
                      }}
                    />
                    <small id="query-port-help">{fields.queryPortHelp}</small>
                  </label>

                  <CustomSelect
                    id="query-mode"
                    name="mode"
                    label="Mode"
                    options={MODE_OPTIONS}
                    value={form.mode}
                    help="Full mode requests optional sources."
                    onChange={(mode) => {
                      update({ mode });
                    }}
                  />

                  <CustomSelect
                    id="query-timeout"
                    name="timeoutMs"
                    label="Deadline"
                    options={TIMEOUT_OPTIONS}
                    value={form.timeoutMs}
                    help="One deadline for the entire query."
                    onChange={(timeoutMs) => {
                      update({ timeoutMs });
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          <p
            className="query-form__error"
            id="query-form-error"
            role="alert"
            hidden={formError === undefined}
          >
            {formError}
          </p>
        </form>
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
          <QueryResult
            key={output.id}
            games={games}
            raw={output.raw}
            result={output.result}
          />
        )}
      </section>
    </section>
  );
}
