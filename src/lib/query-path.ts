import type {
  QuerySource,
  QuerySourceEvent,
  QuerySourceName,
  QuerySourceStatus,
} from "queryhost";
import { QUERY_SOURCE_LABELS as SOURCE_LABELS } from "queryhost/registry";

import { milliseconds } from "./playground-form.js";

const STATUS_LABELS = {
  blocked: "Blocked",
  failed: "Failed",
  malformed: "Malformed",
  "not-requested": "Skipped",
  ok: "Complete",
  timeout: "Timed out",
  unsupported: "Unsupported",
} satisfies Readonly<Record<QuerySourceStatus, string>>;

// The hosted API can run a newer library than this site, so a source or status
// this release does not know keeps its raw name rather than rendering blank.
const KNOWN_SOURCE_LABELS: Readonly<Record<string, string | undefined>> =
  SOURCE_LABELS;
const KNOWN_STATUS_LABELS: Readonly<Record<string, string | undefined>> =
  STATUS_LABELS;

function sourceLabel(source: QuerySourceName): string {
  return KNOWN_SOURCE_LABELS[source] ?? source;
}

function statusLabel(status: QuerySourceStatus): string {
  return KNOWN_STATUS_LABELS[status] ?? status;
}

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
        ? statusLabel(source.status)
        : milliseconds(source.rttMs),
    label: sourceLabel(source.source),
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
      ? { detail: "…", label: sourceLabel(source), source, state: "running" }
      : {
          detail:
            report.rttMs === undefined
              ? statusLabel(report.status)
              : milliseconds(report.rttMs),
          label: sourceLabel(source),
          source,
          state: report.status,
        },
  );
}
