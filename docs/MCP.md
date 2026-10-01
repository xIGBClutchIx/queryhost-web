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
`ui://queryhost/server-cards-v1.html`. `resources/list` and `resources/read` expose
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
stable identity and `mcp.json` points at the Railway-hosted public endpoint. It is
ready for local-marketplace packaging once that endpoint is deployed. No personal
marketplace, install, registered ChatGPT connection ID, or public submission is
created by these source changes. A registered ChatGPT mapping can be added after
developer-mode connection supplies its actual technical ID. Public directory
distribution requires submission and review. Server cards are an optional MCP
Apps UI resource served by this endpoint.

Official references: [Connect and test](https://developers.openai.com/plugins/deploy/connect-chatgpt),
[Plugin packaging](https://developers.openai.com/plugins/build/plugins), and
[Optional MCP Apps UI](https://developers.openai.com/plugins/build/chatgpt-ui).
