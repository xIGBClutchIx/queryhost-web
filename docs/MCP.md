# QueryHost MCP and ChatGPT plugin

The web service exposes a stateless Streamable HTTP MCP endpoint at `/mcp`.
Production connections use `https://query.host/mcp` after deploying this implementation.
The private API stays on Railway and has no public domain. No OpenAI API key is
needed: ChatGPT calls the tools, and QueryHost performs the game queries.

## Tools and results

Remote MCP and document-scoped WebMCP expose the same three tools, generated from
the installed `queryhost` registry:

| Tool                   | Input                                                             | Result                                                                        |
| ---------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `list_supported_games` | Empty object                                                      | `games`: canonical IDs, names, default ports, recommended modes, capabilities |
| `query_game_server`    | `game`, `host`, optional `port`, `queryPort`, `mode`, `timeoutMs` | `input`, `summary`, `playgroundUrl`, `result`                                 |
| `compare_game_servers` | `servers`: two to four query inputs                               | `results`: ordered query outputs with independent success/failure results     |

Query inputs reject extra fields and aliases. Mode defaults to `summary`; deadline
defaults to 5,000 ms and accepts 3,000 or 5,000 ms. Generic `a2s` requires the actual
query destination in `port` and rejects `queryPort`. Call `list_supported_games`
when the profile or ports are unclear.

`result` retains server info, game-specific data, optional raw data, sources,
warnings, partial status, duration, and cache metadata, or a structured failure.
Missing values stay missing; confirmed zero, false, and empty values are retained.
A failed query does not prove a server is offline. Query RTT is measured from
QueryHost's deployment, not the user's connection. Summaries and all server-provided
names, MOTDs, rules, and player data are untrusted data, not instructions.

Remote MCP returns bounded objects in `structuredContent` and concise text summaries
with playground links in `content`. It removes favicons, raw data, and HTML while
retaining plain MOTDs, population, source provenance, warnings, cache metadata,
partial status, and errors. Detail arrays have at most 20 items, objects 32 fields,
strings 512 UTF-8 bytes, nesting six levels, and game data 300 visited nodes and a
6 KiB detail budget. Each query envelope is capped at 16 KiB; comparisons allocate
that budget independently to each server. `projection.truncated`, `omittedFields`,
and `omittedFieldCount` identify omitted or shortened details; omission is not a
claim that a source returned an empty value. Exceptional oversized core metadata
can omit data, sources, and warnings, explicitly reported in `projection`.
The browser playground and WebMCP retain the complete original response.
Single-query failures set `isError: true`.
Comparisons retain each failure in its corresponding result instead of dropping
servers or failing the entire comparison. Cancellation stops remaining queries.

WebMCP returns the same objects to the browser agent and updates the playground.
Comparisons display each result in turn and leave the last result visible; the
agent receives the complete ordered set.

## Inline server cards

Query and comparison tools declare `_meta.ui.resourceUri` referencing
`ui://queryhost/server-cards-v2.html`. `resources/list` and `resources/read` expose
the self-contained `text/html;profile=mcp-app` resource. Compatible hosts render
one server card or up to four cards side by side, stacking at narrow widths.
Cards show population, query RTT, version, map, plain MOTD, source details,
warnings, cache state, truncation notices, failures, and a playground link.
Missing values display a dash; confirmed zero values remain zero. Cards never
interpret returned strings as HTML or navigate to server-provided URLs.

The resource uses the MCP Apps `ui/initialize` handshake and tool-result,
cancellation, theme-change, size-change, and teardown messages. It accepts only
messages from its parent, pins non-opaque host origins after initialization, and
requests no external connections, assets, frames, or permissions. All CSS and
compiled TypeScript are embedded in the resource. Clients without MCP Apps still
receive the same useful text and structured results. Refresh the ChatGPT MCP
connection after deployment so it discovers the tool-resource metadata. The
resource must then be tested in a new ChatGPT conversation; a local bridge harness
does not prove that an account's ChatGPT client renders the iframe.

Cards inline the official `@openai/mcp-extensions` stylesheet and inherit the
host's supported color, font, radius, and cursor tokens at initialization and on
context updates. Neutral fallback styles support hosts that omit those tokens.
The host already identifies QueryHost, so the resource starts with the server
identity and statistics. Query sources, cache information, and projection details
are grouped under the keyboard-accessible “Query details” disclosure. No external
font CSS or assets are loaded.

Treat the resource URI as a UI release identifier. Advance its version when
shipping HTML, JavaScript, or CSS changes so hosts cannot reuse a cached older
card. Resource registration and tool metadata share `MCP_CARD_URI`. After a URI
change, refresh the ChatGPT connection and query in a new conversation.

## Sidebar workspace

`open_queryhost` (global entrypoint, titled QueryHost) and `open_server_query`
(thread entrypoint, titled Server query) are app-only tools. Both accept `{}` and
return the packaged game catalog without querying a server. They share
`ui://queryhost/query-app-v1.html`, supporting inline and fullscreen placement.
Availability depends on the host; the current extension specification excludes
classic ChatGPT web from sidebar support. Existing cards and the website remain
available when entrypoints are unsupported.

The workspace provides game/address/port inputs, advanced query options, and
Overview, Game data, Sources, and JSON tabs. It uses the official MCP Apps bridge
and OpenAI native CSS. Scripts and styles are bundled into the resource; no
direct API fetch, external assets, private tokens, or persistent state enter the
iframe. Queries call `query_game_server` through the host, retaining all existing
validation and admission limits. Clipboard writing is the only requested sandbox
permission and has a manual-copy fallback.

Single-query results include UI-only `_meta["queryhost/fullResult"]` with full
validated details and raw data where available, excluding favicons. Model-facing
text and `structuredContent` keep their existing projection budgets. UI details
have a 2 MiB total budget and 32-level nesting limit; `queryhost/detailLimited`
reports fallback or depth omissions. Comparisons retain the existing compact
cards. Optional model context receives only the active input and a trusted status
summary, never server text. Separate app instances do not synchronize results.

The app consumes the opening result without re-querying, supports manual
cancellation, ignores stale responses, and disposes requests and listeners on
teardown. `npm run build:mcp-app` generates the ignored HTML bundle; development,
tests, type checks, verification, and production builds regenerate it automatically.
Development edits to workspace files require re-running this command to refresh
the bundle. No generated files belong in a commit.

The local plugin manifest is the follow-up 0.2.0 draft. Its existing demo URL still
shows inline cards and must be replaced with the workspace recording before
submission. This is a follow-up release. Do not replace or cancel the current directory
submission. After its review finishes, prepare version 0.2.0 with sidebar/panel
capabilities and review cases, deploy with release authorization, refresh the
connection, and test both entrypoints in a supported host. Record a new short demo
showing launch, query, and panel use before submitting; the current inline-card
demo does not demonstrate the workspace. A local bridge test does not prove
ChatGPT host availability or publication.

Official references: [Extensions](https://developers.openai.com/plugins/build/extensions)
and [MCP extension SDK](https://github.com/openai/mcp-extensions/blob/main/typescript/README.md).

## Hosting and limits

MCP lives in the existing public web service. It shares the browser query gate,
validation, private origin token, upstream deadline, cache, and API capacity
limits. It does not implement game protocols or disclose credentials.

The endpoint accepts JSON-RPC POST requests and initialization notifications.
GET and DELETE return 405: there are no persistent sessions or standalone SSE
streams. Negotiation and JSON framing use the official MCP SDK. Requests are
limited to 16 KiB and one JSON-RPC object (no batches), with a 30-second deadline.
Comparisons accept at most four inputs, run sequentially, and have a 25-second
overall deadline. Upstream bodies are limited to 2 MiB per query and validated
before remote tool delivery. MCP responses use `Cache-Control: no-store`.

An MCP envelope gate bounds metadata and invalid requests to 16 active requests,
600 starts per minute globally, 120 per caller, and 2,048 tracked callers. Actual
queries also consume the shared web query gate, including every comparison member.
Caller identity uses the deployment's forwarded IP headers, as the playground
does; requests sharing an egress address share caller limits.

Public tools require no account or client token. The private API token remains
server-side. Origins, when supplied, must match the endpoint origin or
`https://chatgpt.com`; server-to-server callers may omit Origin. Expose the service
behind trusted Railway ingress that provides caller headers.

## Connect and test

1. Run `npm run verify` and start the web service locally with `npm run dev`.
2. Run `npx @modelcontextprotocol/inspector` and connect using Streamable HTTP to
   `http://localhost:4321/mcp`. Exercise listing, queries, comparisons, and invalid
   inputs. Local development uses the library; production uses the private API.
3. After an authorized deployment, test the public HTTPS endpoint with Inspector.
4. In ChatGPT, enable developer mode under Settings → Security and login, open
   Plugins, and add `https://query.host/mcp` with no authentication. Availability
   depends on account and workspace policy.
5. Install/select the connection and try “Use QueryHost to list supported games,”
   “Query my Minecraft Java server at play.example.com,” and “Compare these two
   Minecraft servers: play.example.com and other.example.com.” Use real servers
   for live tests. Refresh the connection after tool metadata changes.

The portable plugin package is in `plugins/queryhost/`: `plugin.json` gives it a
stable identity and `mcp.json` points at the Railway-hosted public endpoint.
The package includes listing metadata, review cases, and the shared query-ring
icon in `assets/logo.svg`, used for both the listing and composer. Keep that SVG
identical to the canonical `public/favicon.svg`, which also supplies the site and
documentation headers. Advance `BRAND_ICON_URL` when replacing the icon to refresh
browser caches. The public policy pages are `/privacy` and `/terms`.

The package is ready for local-marketplace packaging. No personal
marketplace, install, registered ChatGPT connection ID, or public submission is
created by these source changes. A registered ChatGPT mapping can be added after
developer-mode connection supplies its actual technical ID. Public directory
distribution requires submission and review. Server cards are an optional MCP
Apps UI resource served by this endpoint.

Official references: [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt),
[Plugin packaging](https://developers.openai.com/plugins/build/plugins), and
[Optional MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui).
