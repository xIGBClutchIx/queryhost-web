import { startMcpCards } from "../lib/mcp-card-app.js";

export const MCP_CARD_URI = "ui://queryhost/server-cards-v1.html";
export const MCP_CARD_MIME = "text/html;profile=mcp-app";

/** A portable, self-contained resource: no external scripts, fonts, images or API calls. */
export function mcpCardHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QueryHost server results</title>
<style>
:root { color-scheme: light dark; font: 14px/1.5 system-ui, sans-serif; --bg: #fff; --surface: #f6f8f7; --text: #152522; --muted: #596964; --line: #d5dfdb; --accent: #08745c; --warning: #8a5111; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0b1215; --surface: #10191d; --text: #f3f8f6; --muted: #95a6a2; --line: #26363b; --accent: #55d7ba; --warning: #e2a95f; } }
:root[data-theme="dark"] { color-scheme: dark; --bg: #0b1215; --surface: #10191d; --text: #f3f8f6; --muted: #95a6a2; --line: #26363b; --accent: #55d7ba; --warning: #e2a95f; }
:root[data-theme="light"] { color-scheme: light; }
* { box-sizing: border-box; } body { margin: 0; padding: 16px; background: var(--bg); color: var(--text); }
header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 12px; } h1 { font-size: 15px; margin: 0; } header span, .muted, #status, .host, dt { color: var(--muted); }
#cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)); gap: 12px; align-items: start; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 18px; min-width: 0; }
h2 { font-size: 18px; line-height: 1.3; margin: 4px 0; overflow-wrap: anywhere; } p { margin: 8px 0; overflow-wrap: anywhere; }
.game { margin: 0; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; font-size: 11px; } .host { font-size: 12px; }
.badge { font-size: 12px; font-weight: 600; margin: 14px 0; } .success, a { color: var(--accent); } .failure, .error, .warnings { color: var(--warning); }
.stats { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin: 16px 0; } dt { font-size: 12px; } dd { margin: 0; font-size: 16px; font-weight: 600; overflow-wrap: anywhere; }
.motd { border-top: 1px solid var(--line); padding-top: 12px; } .muted, #status { font-size: 12px; } #status { margin: 12px 0 0; }
summary { cursor: pointer; } ul { padding-left: 18px; } li { overflow-wrap: anywhere; } .sources { font-size: 12px; }
a { display: inline-block; margin-top: 12px; font-weight: 600; text-decoration: none; } a:hover { text-decoration: underline; } :focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
@media (max-width: 440px) { body { padding: 12px; } .card { padding: 16px; } }
</style></head><body><header><h1>QueryHost</h1><span>Server results</span></header><main id="cards" aria-label="Game server results"></main><p id="status" role="status">Waiting for a server query…</p>
<script>(${startMcpCards.toString()})();</script></body></html>`;
}
