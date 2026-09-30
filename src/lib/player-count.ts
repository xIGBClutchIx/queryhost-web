import type { ServerPlayers } from "queryhost";

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

function countText(value: number | undefined): string {
  return value === undefined ? "—" : COUNT_FORMAT.format(value);
}

/** Formats a player count, keeping an unconfirmed value visibly distinct from zero. */
export function formatPlayerCount(players: ServerPlayers): string {
  return `${countText(players.online)} / ${countText(players.max)}`;
}

/** Returns how full the server is, or undefined when either count is unconfirmed. */
export function playerFillRatio(players: ServerPlayers): number | undefined {
  const { max, online } = players;
  if (online === undefined || max === undefined || max <= 0) {
    return undefined;
  }

  return Math.min(Math.max(online / max, 0), 1);
}
