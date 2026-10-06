import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import { shareUrl } from "../../lib/playground-form.js";
import { requestPlaygroundQuery } from "../../lib/playground-query.js";
import { PlaygroundRequestCoordinator } from "../../lib/playground-request-coordinator.js";
import type { WebMcpRegistration } from "../../lib/webmcp.js";

export type QueryOutcome =
  PlaygroundProxyErrorResponse | PlaygroundQueryResponse;

export type OutputState =
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
      readonly result: PlaygroundQueryResponse;
    };

/** Resources owned while the page is live; bfcache restores start a new session. */
interface PlaygroundSession {
  readonly controller: AbortController;
  readonly coordinator: PlaygroundRequestCoordinator;
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

export interface PlaygroundSessionControls {
  readonly output: OutputState;
  /** Runs one query, superseding any in flight, and reports its outcome. */
  readonly runQuery: (
    input: PlaygroundQueryInput,
    executionSignal?: AbortSignal,
  ) => Promise<QueryOutcome>;
}

/**
 * Owns the playground's request lifecycle and WebMCP tools for the page's lifetime,
 * including bfcache exits. `onAgentQuery` must be stable; it mirrors an agent's
 * input into the form before the query runs.
 */
export function usePlaygroundSession(
  games: readonly PlaygroundGameDefinition[],
  onAgentQuery: (input: PlaygroundQueryInput) => void,
): PlaygroundSessionControls {
  const [output, setOutput] = useState<OutputState>({ kind: "idle" });
  const sessionRef = useRef<PlaygroundSession | undefined>(undefined);
  const resultSequence = useRef(0);

  const runQuery = useCallback(
    async (
      input: PlaygroundQueryInput,
      executionSignal?: AbortSignal,
    ): Promise<QueryOutcome> => {
      const session = sessionRef.current;
      if (session === undefined) {
        throw abortError("The playground is not active.");
      }
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
              onAgentQuery(input);
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
  }, [games, onAgentQuery, runQuery]);

  return { output, runQuery };
}
