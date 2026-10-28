import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type {
  PlaygroundDetectInput,
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "../../lib/playground-contracts.js";
import {
  detectedQueryInput,
  findGame,
  shareUrl,
} from "../../lib/playground-form.js";
import {
  requestPlaygroundDetect,
  requestPlaygroundQuery,
  UnexpectedResponseError,
} from "../../lib/playground-query.js";
import {
  applySourceEvent,
  type SourceProgressEntry,
} from "../../lib/query-path.js";
import { PlaygroundRequestCoordinator } from "../../lib/playground-request-coordinator.js";
import { resultTitle } from "../../lib/result-url.js";
import { HOME_TITLE } from "../../lib/site.js";
import type { WebMcpRegistration } from "../../lib/webmcp.js";

export type QueryOutcome =
  PlaygroundProxyErrorResponse | PlaygroundQueryResponse;

/** What a request error's Try again sends again. */
export type QueryAttempt =
  | { readonly input: PlaygroundDetectInput; readonly kind: "detect" }
  | { readonly input: PlaygroundQueryInput; readonly kind: "query" };

export type OutputState =
  | { readonly kind: "idle" }
  | {
      /** Whether the game is still being detected rather than queried. */
      readonly detecting: boolean;
      /** The address being queried, for the loading announcement. */
      readonly host: string;
      readonly kind: "loading";
      /** Sources the running query has reported so far. */
      readonly progress: readonly SourceProgressEntry[];
    }
  | {
      readonly attempt: QueryAttempt;
      readonly code: string;
      /** Replaces the default heading, as when no game was detected. */
      readonly heading?: string;
      readonly kind: "error";
      readonly message: string;
    }
  | {
      /** Whether Auto detection chose the game. */
      readonly detected: boolean;
      readonly id: number;
      readonly input: PlaygroundQueryInput;
      readonly kind: "result";
      readonly result: PlaygroundQueryResponse;
    };

type SettledOutput = Exclude<OutputState, { readonly kind: "loading" }>;

/** The last finished output and the address and title that went with it. */
interface SettledPage {
  readonly href: string;
  readonly output: SettledOutput;
  readonly title: string;
}

/** Resources owned while the page is live; bfcache restores start a new session. */
interface PlaygroundSession {
  readonly controller: AbortController;
  readonly coordinator: PlaygroundRequestCoordinator;
}

function abortError(message: string): DOMException {
  return new DOMException(message, "AbortError");
}

/** A request that failed before it produced a result or a proxy error. */
function requestFailure(
  error: Error | undefined,
): PlaygroundProxyErrorResponse["error"] {
  if (error instanceof UnexpectedResponseError) {
    return { code: error.code, message: error.message };
  }
  return {
    code: "NETWORK_ERROR",
    message:
      error?.message ??
      "The browser could not reach the QueryHost web service.",
  };
}

/** Points the address bar and the tab title at the page being shown. */
function showLocation(href: string | URL, title: string): void {
  history.replaceState(history.state, "", href);
  document.title = title;
}

export interface PlaygroundSessionControls {
  /**
   * Abandons the running query or detection and returns to the last finished
   * output, with the address and title that went with it.
   */
  readonly cancel: () => void;
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
  // The idle playground is the homepage, whatever link first opened it.
  const settled = useRef<SettledPage>({
    href: "/",
    output: { kind: "idle" },
    title: HOME_TITLE,
  });

  useEffect(() => {
    if (output.kind === "loading") return;
    settled.current =
      output.kind === "idle"
        ? { href: "/", output, title: HOME_TITLE }
        : { href: window.location.href, output, title: document.title };
  }, [output]);

  // An abandoned request must not stay in the address bar, where a reload
  // would run it again.
  const rollBack = useCallback(() => {
    const page = settled.current;
    showLocation(new URL(page.href, window.location.href), page.title);
    setOutput(page.output);
  }, []);

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
      showLocation(
        shareUrl(window.location.href, input, games),
        resultTitle(input, findGame(games, input.game)),
      );
      setOutput({
        detecting: false,
        host: input.host,
        kind: "loading",
        progress: [],
      });
      const attempt: QueryAttempt = { input, kind: "query" };

      try {
        const response = await requestPlaygroundQuery(
          input,
          request.signal,
          fetch,
          (event) => {
            if (!request.isCurrent()) return;
            setOutput((current) =>
              current.kind === "loading"
                ? {
                    ...current,
                    progress: applySourceEvent(current.progress, event),
                  }
                : current,
            );
          },
        );
        if (!request.isCurrent()) {
          throw abortError("The query was superseded.");
        }
        if (response.kind === "proxy-error") {
          setOutput({ attempt, kind: "error", ...response.body.error });
          return response.body;
        }
        resultSequence.current += 1;
        setOutput({
          detected: false,
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
          rollBack();
          throw abortError("The query was cancelled.");
        }
        const failure: PlaygroundProxyErrorResponse = {
          error: requestFailure(error instanceof Error ? error : undefined),
        };
        setOutput({ attempt, kind: "error", ...failure.error });
        return failure;
      }
    },
    [games, rollBack],
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
      showLocation(new URL("/", window.location.href), HOME_TITLE);
      setOutput({
        detecting: true,
        host: input.host,
        kind: "loading",
        progress: [],
      });
      const attempt: QueryAttempt = { input, kind: "detect" };

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
          setOutput({ attempt, kind: "error", ...response.body.error });
          return undefined;
        }
        if (response.kind === "undetected") {
          setOutput({
            attempt,
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
        showLocation(
          shareUrl(window.location.href, detected, games),
          resultTitle(detected, response.game),
        );
        resultSequence.current += 1;
        setOutput({
          detected: true,
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
          rollBack();
          throw abortError("The detection was cancelled.");
        }
        setOutput({
          attempt,
          kind: "error",
          ...requestFailure(error instanceof Error ? error : undefined),
        });
        return undefined;
      }
    },
    [games, rollBack],
  );

  // Read by Cancel and pagehide, which never run mid-render.
  const outputKind = useRef(output.kind);
  useLayoutEffect(() => {
    outputKind.current = output.kind;
  }, [output.kind]);

  const cancel = useCallback(() => {
    const session = sessionRef.current;
    if (session === undefined) return;
    session.coordinator.abort();
    if (outputKind.current === "loading") rollBack();
  }, [rollBack]);

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

    // Leaving the page, which bfcache may restore, abandons a running query
    // like Cancel does. A client-side navigation only unmounts the island, and
    // must not rewrite the address the router is moving to.
    function leave(): void {
      if (outputKind.current === "loading") rollBack();
      stop();
    }

    function restore(event: PageTransitionEvent): void {
      if (event.persisted) start();
    }

    start();
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", restore);
      stop();
    };
  }, [games, onAgentQuery, rollBack, runQuery]);

  return { cancel, output, runDetect, runQuery };
}
