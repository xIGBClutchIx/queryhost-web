# Title

QueryHost

## One-line Summary

QueryHost gives browser agents two typed WebMCP tools for discovering game profiles and querying live servers, then renders the same result for a person to inspect and continue.

## Problem

Game servers expose status through different protocols, default ports, optional query ports, and response shapes. A person or browser agent must know those details before asking a basic question such as whether a server is online or who is playing.

Browser agents can attempt to operate a form through page controls, but that approach hides the site's domain contract and safety rules. A detached agent response also leaves the person without the query inputs, source provenance, warnings, and raw result in the product UI.

## Solution

QueryHost puts six game profiles behind one public playground and two document-scoped WebMCP tools:

- `list_supported_games` returns canonical game IDs, names, ports, recommended modes, and capabilities from `queryhost@1.0.0`.
- `query_game_server` accepts a canonical game, plain host, bounded ports, query mode, and deadline. It sends the request through the same `/api/query` route as the form.

An agent can discover the correct profile, run a bounded query, and write the response into the playground. The person can inspect the overview, game data, source reports, warnings, and raw JSON, then change the populated controls and run another query.

## Why This Matters

QueryHost gives server owners, community operators, and players a consistent way to inspect live multiplayer servers without learning each wire protocol. WebMCP lets an agent use that product contract while QueryHost keeps target validation, throttling, cancellation, and result semantics in one path.

The shared UI creates a useful handoff. The agent handles discovery and the first query. The person sees the evidence, changes the request, and continues from the same state.

## How We Used AI

AI enters through the browser. A compatible agent reads the two WebMCP schemas, chooses a canonical game profile, invokes the query tool, and receives structured data. QueryHost then renders that same response in the playground.

The query engine remains deterministic. It performs live protocol queries, validates targets, and returns typed results with source provenance. Server names, messages, rules, and player data carry an untrusted-content annotation because remote servers control those values.

## How We Used Codex

Codex helped plan Slice 21, inspect the three-repository architecture, implement the WebMCP adapter, and add regression tests for tool contracts, registration, cleanup, cancellation, and stale-response prevention. It also reviewed the security boundary, ran repository gates, checked the production deployment, and exercised the live tools in Chrome.

Codex helped prepare the demo script and acceptance checklist. ChatCut produced the edit and AI narration, and Codex checked duration, codecs, audio levels, black frames, sampled frames, and the final YouTube upload.

## Key Features

- Six canonical game profiles sourced from the published QueryHost registry.
- Two read-only WebMCP tools registered on the live playground.
- Agent queries rendered into the human-facing form and result tabs.
- One request coordinator for human and agent cancellation, with request identity blocking stale UI updates.
- Same-origin validation and throttling before the private API performs a live query.
- Honest success, partial, failure, validation, throttling, and cancellation results.
- Full human functionality in browsers without WebMCP.

## Architecture

The browser registers the tools only when `document.modelContext` exists. Both tool definitions live in the web application. The portable library and hosted API contain no browser-specific code.

`query_game_server` uses this path:

1. The browser validates the tool's JSON schema and starts the shared request coordinator.
2. The web application sends the input to its same-origin `POST /api/query` route.
3. The route applies caller validation and throttling before forwarding the request to the private Railway API.
4. The API uses `queryhost@1.0.0` to query the validated, pinned public target.
5. The browser returns the existing playground response and renders it into the visible UI.

One registration controller cleans up both tools on navigation. Registration rolls back if either tool fails. The execution signal aborts in-flight fetch work, and request identity prevents late responses from replacing newer results.

## Testing Instructions

No account or credentials are required.

1. Open <https://query.host/> in ChatGPT's in-app browser or Google Chrome 149 or later with WebMCP enabled.
2. Confirm that the page registers exactly `list_supported_games` and `query_game_server`.
3. Invoke `list_supported_games` and inspect the six returned profiles.
4. Invoke `query_game_server` with `game: "minecraft-java"`, `host: "test-minecraft.nodecraft.gg"`, `mode: "summary"`, and `timeoutMs: 5000`.
5. Confirm that the tool response also appears in the playground, including the populated form, overview, query path, warnings, and raw JSON.
6. Open Advanced options, change Summary to Full details, and submit through the form to continue the workflow by hand. The optional Minecraft Query source may time out; QueryHost preserves the valid status response and marks the result partial.

The repository gate is `npm run verify`. The accepted production build passed formatting, TypeScript and Astro checks, lint, 41 tests, and the production build. Chrome acceptance covered both tools, an approved live query, a blocked localhost target, cancellation, stale-result prevention, and the normal unsupported-browser experience.

## Public Demo Link

<https://query.host/>

WebMCP documentation: <https://docs.query.host/webmcp/>

## Public Repository Link

Primary repository: <https://github.com/xIGBClutchIx/queryhost-web>

Related source:

- Hosted API: <https://github.com/xIGBClutchIx/queryhost-api>
- Published library: <https://github.com/xIGBClutchIx/queryhost>
- npm package: <https://www.npmjs.com/package/queryhost>

GitHub reports the primary repository as public and detects its Apache-2.0 license.

## Demo Video

Public YouTube video: <https://youtu.be/y5EI2RQdpVQ>

Runtime: 2 minutes 25 seconds. The video shows Chrome discovering both WebMCP tools, registry discovery, an approved Minecraft Java query, the agent-produced result in the playground, manual continuation, the WebMCP documentation, and the public source repository. The video uses AI narration and contains no background music.

## Selected Screenshot Frames

Contact sheet: [all five selected frames](../docs/devpost/frames/contact-sheet.png)

1. [WebMCP tool discovery at 00:18](../docs/devpost/frames/01-webmcp-tool-discovery.png) — Chrome's WebMCP panel shows exactly `list_supported_games` and `query_game_server`.
2. [Registry tool detail at 00:45](../docs/devpost/frames/02-list-supported-games.png) — the selected `list_supported_games` tool explains its registry-derived profile contract.
3. [Agent-produced result at 01:44](../docs/devpost/frames/03-agent-query-result.png) — the approved Minecraft query appears in the playground with online status, version, players, MOTD, and query path.
4. [Human continuation at 01:56](../docs/devpost/frames/04-human-full-query.png) — the same populated form is switched to Full details while the narration explains the optional-source timeout.
5. [Public source at 02:20](../docs/devpost/frames/05-public-repository.png) — GitHub shows the public primary repository and detected Apache-2.0 license.

## Submission Readiness Notes

Ready:

- Devpost account authentication and challenge registration are confirmed.
- The live application, WebMCP documentation, public repository, license, and public video have final URLs.
- Signed commits `ceaa6d2` and `dc72c57` document the WebMCP implementation and Chrome compatibility work added after August 25, 2026.
- The demo and repository describe the same two tools and the same approved query workflow.
- The four personal form answers are recorded below.
- Five inspected 1920×1080 frames from the accepted demo are ready under `../docs/devpost/frames/`.

Devpost result:

- Submission `1168038` was accepted on September 2, 2026 and verified through a live project readback.
- Public project page: <https://devpost.com/software/queryhost>
- Frame 03 is the project thumbnail.

## Known Limitations

- WebMCP remains experimental. Tool discovery requires ChatGPT's in-app browser or a supported Chrome build with WebMCP enabled.
- Live results depend on server reachability and the protocols each server exposes. Optional-source failures can produce a valid partial result.
- The site registers tools only on the playground document.
- QueryHost supports six published game profiles and does not store accounts, query history, or persistent results.

## Official Form Fields

### Submitter Type

`Individual`

### Country of residence of yourself and team members if applicable

`United States`

### Organization name

Not applicable — individual submission. Leave this field blank if Devpost permits it.

### App Status

`Existing`

### Existing-project update during the submission period

QueryHost existed before the challenge. After August 25, 2026, the project added two WebMCP tools to the public playground, shared agent-and-human request coordination, browser cancellation, visible agent-result handoff, WebMCP documentation, regression tests, Chrome compatibility, and production acceptance evidence. Signed commits `ceaa6d2` and `dc72c57` identify that work.

### Live URL

<https://query.host/>

### Testing instructions

No credentials are required. Open <https://query.host/> in ChatGPT's in-app browser or Chrome 149 or later with WebMCP enabled. Discover `list_supported_games` and `query_game_server`. Call the query tool with `game: "minecraft-java"`, `host: "test-minecraft.nodecraft.gg"`, `mode: "summary"`, and `timeoutMs: 5000`. Confirm that the response appears in the visible playground, then change the mode under Advanced options and query again by hand.

### Public code repository

<https://github.com/xIGBClutchIx/queryhost-web>

### Which agent(s) or client(s) did you test your WebMCP tools with?

Google Chrome 149 or later with the WebMCP and WebMCP Testing flags enabled. Chrome discovered and invoked both production tools through its WebMCP testing interface.

### Which AI tools have you leveraged while working on this project?

OpenAI Codex for planning, implementation, testing, security review, browser acceptance, deployment checks, and submission preparation. ChatCut Desktop for the demo edit and AI voiceover.

### Learning level

`Significant`

### AI value applicable to your career

`Yes`
