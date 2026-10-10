import type {
  QuerySource,
  QuerySourceEvent,
  QuerySourceName,
  QuerySourceStatus,
} from "queryhost";

import { milliseconds } from "./playground-form.js";

const SOURCE_LABELS = {
  "a2s-info": "Info",
  "a2s-player": "Players",
  "a2s-rules": "Rules",
  "eco-frontpage": "Front page",
  "fivem-dynamic": "Status",
  "fivem-info": "Server info",
  "fivem-players": "Players",
  "redm-dynamic": "Status",
  "redm-info": "Server info",
  "redm-players": "Players",
  "satisfactory-lightweight": "Server state",
  "satisfactory-health": "Health",
  "vintage-story-query": "Server query",
  "minecraft-bedrock-raknet": "Bedrock ping",
  "minecraft-query": "Query",
  "minecraft-slp": "Status",
  "minecraft-srv": "SRV",
} satisfies Readonly<Record<QuerySourceName, string>>;

const STATUS_LABELS = {
  blocked: "Blocked",
  failed: "Failed",
  malformed: "Malformed",
  "not-requested": "Skipped",
  ok: "Complete",
  timeout: "Timed out",
  unsupported: "Unsupported",
} satisfies Readonly<Record<QuerySourceStatus, string>>;

export interface QueryPathItem {
  readonly detail: string;
  readonly label: string;
  readonly source: QuerySourceName;
  readonly status: QuerySourceStatus;
}

/** Creates the compact, user-facing view of one query's protocol sources. */
export function queryPathItems(
  sources: readonly QuerySource[],
): readonly QueryPathItem[] {
  return sources.map((source) => ({
    detail:
      source.rttMs === undefined
        ? STATUS_LABELS[source.status]
        : milliseconds(source.rttMs),
    label: SOURCE_LABELS[source.source],
    source: source.source,
    status: source.status,
  }));
}

/** What the page knows about one source of a query still running. */
export interface SourceProgressEntry {
  readonly source: QuerySourceName;
  /** Present once the source completed. */
  readonly report?: QuerySource;
}

/** Folds one progress event into the running list, keeping first-seen order. */
export function applySourceEvent(
  progress: readonly SourceProgressEntry[],
  event: QuerySourceEvent,
): readonly SourceProgressEntry[] {
  const entry: SourceProgressEntry =
    event.type === "started"
      ? { source: event.source }
      : { report: event.report, source: event.report.source };
  const index = progress.findIndex((item) => item.source === entry.source);
  if (index === -1) return [...progress, entry];
  // A late `started` never undoes a completion.
  if (entry.report === undefined) return progress;
  return progress.map((item, position) => (position === index ? entry : item));
}

export interface SourceProgressItem {
  readonly detail: string;
  readonly label: string;
  readonly source: QuerySourceName;
  readonly state: QuerySourceStatus | "running";
}

/** Creates the compact view of a running query's sources. */
export function sourceProgressItems(
  progress: readonly SourceProgressEntry[],
): readonly SourceProgressItem[] {
  return progress.map(({ report, source }) =>
    report === undefined
      ? { detail: "…", label: SOURCE_LABELS[source], source, state: "running" }
      : {
          detail:
            report.rttMs === undefined
              ? STATUS_LABELS[report.status]
              : milliseconds(report.rttMs),
          label: SOURCE_LABELS[source],
          source,
          state: report.status,
        },
  );
}
