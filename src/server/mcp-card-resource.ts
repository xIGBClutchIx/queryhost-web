import { startMcpCards } from "../lib/mcp-card-app.js";
import nativeStyles from "@openai/mcp-extensions/app/styles.css?raw";

export const MCP_CARD_URI = "ui://queryhost/server-cards-v1.html";
export const MCP_CARD_MIME = "text/html;profile=mcp-app";

/** A portable, self-contained resource: no external scripts, fonts, images or API calls. */
export function mcpCardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QueryHost server results</title>
<style>
${nativeStyles}
* { box-sizing: border-box; } html { background: var(--background); } body { background: transparent; padding: 2px; }
#cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 12px; align-items: start; }
.server-content { padding: 8px; display: grid; gap: 16px; min-width: 0; }
.server-heading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.game { color: var(--muted-foreground); font-size: max(11px, calc(var(--font-size-base) - 2px)); }
h2 { font-size: calc(var(--font-size-base) * 1.28); line-height: 1.35; overflow-wrap: anywhere; }
.host { margin-top: 4px; color: var(--muted-foreground); font-size: max(11px, calc(var(--font-size-base) - 2px)); }
.badge { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: max(11px, calc(var(--font-size-base) - 2px)); white-space: nowrap; }
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.success { color: var(--color-text-success, light-dark(#18794e, #70d2a0)); }
.partial, .failure, .error, .warnings { color: var(--color-text-warning, var(--destructive)); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 0; }
dt, .muted, #status { color: var(--muted-foreground); font-size: max(11px, calc(var(--font-size-base) - 2px)); }
dd { margin: 3px 0 0; font-size: calc(var(--font-size-base) * 1.14); font-weight: var(--font-weight-medium, 500); overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
p, li { overflow-wrap: anywhere; } .motd { border-top: 1px solid var(--border); padding-top: 14px; }
.diagnostics { border-top: 1px solid var(--border); padding-top: 12px; }
summary { color: var(--muted-foreground); font-size: max(11px, calc(var(--font-size-base) - 2px)); min-height: 28px; align-content: center; }
.diagnostic-content { display: grid; gap: 8px; padding-top: 8px; } ul { margin: 0; padding-left: 18px; } .sources { font-size: max(11px, calc(var(--font-size-base) - 2px)); }
.card-footer { display: flex; justify-content: flex-end; } #status { margin: 10px 8px 0; } #status:empty { display: none; }
:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
@media (max-width: 440px) { .server-content { padding: 4px; } }
</style></head><body><main id="cards" aria-label="Game server results"></main><p id="status" role="status">Waiting for a server query…</p>
<script>(${startMcpCards.toString()})();</script></body></html>`;
}
