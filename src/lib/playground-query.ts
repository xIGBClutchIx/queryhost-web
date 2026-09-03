import type {
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
  PlaygroundQueryResponse,
} from "./playground-contracts.js";

export type PlaygroundRequestResult =
  | {
      readonly body: PlaygroundProxyErrorResponse;
      readonly kind: "proxy-error";
      readonly raw: string;
    }
  | {
      readonly body: PlaygroundQueryResponse;
      readonly kind: "query";
      readonly raw: string;
    };

export type PlaygroundFetcher = (
  input: string | URL,
  init: RequestInit,
) => Promise<Response>;

/** Sends one browser query through the public same-origin boundary. */
export async function requestPlaygroundQuery(
  input: PlaygroundQueryInput,
  signal: AbortSignal,
  fetcher: PlaygroundFetcher = fetch,
): Promise<PlaygroundRequestResult> {
  const response = await fetcher("/api/query", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
    signal,
  });
  const raw = await response.text();
  if (!response.ok) {
    return {
      body: JSON.parse(raw) as PlaygroundProxyErrorResponse,
      kind: "proxy-error",
      raw,
    };
  }
  return {
    body: JSON.parse(raw) as PlaygroundQueryResponse,
    kind: "query",
    raw,
  };
}
