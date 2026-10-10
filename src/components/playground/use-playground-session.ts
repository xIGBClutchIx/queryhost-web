import { useCallback, useEffect, useRef, useState } from "react";

import type {
  PlaygroundDetectInput,
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import { detectedQueryInput, shareUrl } from "../../lib/playground-form.js";
import {
  requestPlaygroundDetect,
  requestPlaygroundQuery,
} from "../../lib/playground-query.js";
import { PlaygroundRequestCoordinator } from "../../lib/playground-request-coordinator.js";
import type { WebMcpRegistration } from "../../lib/webmcp.js";

export type QueryOutcome =
  PlaygroundProxyErrorResponse | PlaygroundQueryResponse;

export type OutputState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "loading";
      /** Whether the game is still being detected rather than queried. */
      readonly detecting: boolean;
    }
  | {
      readonly code: string;
      /** Replaces the default heading, as when no game was detected. */
      readonly heading?: string;
      readonly kind: "error";
      readonly message: string;
    }
  | {
      readonly id: number;
      readonly input: PlaygroundQueryInput;
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
  /**
   * Detects the game, then shows its query like `runQuery`. Resolves with the
   * detected game's query input, or `undefined` when no game was identified.
   */
  readonly runDetect: (
    input: PlaygroundDetectInput,
  ) => Promise<PlaygroundQueryInput | undefined>;
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
        shareUrl(window.location.href, input, games),
      );
      setOutput({ detecting: false, kind: "loading" });

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
          input,
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
    [games],
  );

  const runDetect = useCallback(
    async (
      input: PlaygroundDetectInput,
    ): Promise<PlaygroundQueryInput | undefined> => {
      const session = sessionRef.current;
      if (session === undefined) {
        throw abortError("The playground is not active.");
      }
      const request = session.coordinator.start();
      // Until a game is found there is no result to link to, so an earlier
      // result page must not stay in the address bar for this new target.
      history.replaceState(
        history.state,
        "",
        new URL("/", window.location.href),
      );
      setOutput({ detecting: true, kind: "loading" });

      try {
        const response = await requestPlaygroundDetect(
          input,
          games,
          request.signal,
        );
        if (!request.isCurrent()) {
          throw abortError("The detection was superseded.");
        }
        if (response.kind === "proxy-error") {
          setOutput({ kind: "error", ...response.body.error });
          return undefined;
        }
        if (response.kind === "undetected") {
          setOutput({
            code: response.code,
            heading: "No supported game was detected.",
            kind: "error",
            message: response.message,
          });
          return undefined;
        }
        const detected = detectedQueryInput(
          input,
          response.game,
          response.matchedPort,
        );
        // Auto has no share URL of its own; the link names the detected game.
        history.replaceState(
          history.state,
          "",
          shareUrl(window.location.href, detected, games),
        );
        resultSequence.current += 1;
        setOutput({
          id: resultSequence.current,
          input: detected,
          kind: "result",
          result: response.body,
        });
        return detected;
      } catch (error) {
        if (!request.isCurrent()) {
          throw abortError("The detection was cancelled.");
        }
        if (request.signal.aborted) {
          setOutput({ kind: "idle" });
          throw abortError("The detection was cancelled.");
        }
        setOutput({
          code: "NETWORK_ERROR",
          kind: "error",
          message:
            error instanceof Error
              ? error.message
              : "The browser could not reach the QueryHost web service.",
        });
        return undefined;
      }
    },
    [games],
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

  return { output, runDetect, runQuery };
}
