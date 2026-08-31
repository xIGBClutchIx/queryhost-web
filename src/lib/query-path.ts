import type {
  QuerySource,
  QuerySourceName,
  QuerySourceStatus,
} from "queryhost";

const SOURCE_LABELS = {
  "a2s-info": "Info",
  "a2s-player": "Players",
  "a2s-rules": "Rules",
  "fivem-dynamic": "Status",
  "fivem-info": "Server info",
  "fivem-players": "Players",
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

function milliseconds(value: number): string {
  return `${Math.round(value * 10) / 10} ms`;
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
