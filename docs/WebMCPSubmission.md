# WebMCP hackathon submission guide

## Submission URLs

- Live application: <https://query.host/>
- WebMCP documentation: <https://docs.query.host/webmcp/>
- Primary public repository: <https://github.com/xIGBClutchIx/queryhost-web>
- Hosted API source: <https://github.com/xIGBClutchIx/queryhost-api>
- Published library source: <https://github.com/xIGBClutchIx/queryhost>
- npm package: <https://www.npmjs.com/package/queryhost>

Add the public YouTube URL to the Devpost form after recording and checking the
final upload. Do not commit test-server credentials or private API values.

## Submission description

QueryHost is a strong fit for WebMCP because querying a game server normally
requires a person or agent to know a game-specific identifier, default ports,
optional query ports, supported detail levels, and how to interpret partial
protocol results. WebMCP gives the browser agent a small typed interface to the
same live playground instead of making it guess at form controls or bypass the
site's safety boundary.

The `list_supported_games` tool exposes the six canonical profiles directly
from the installed `queryhost@1.0.0` registry. The `query_game_server` tool
accepts a canonical game, plain host, bounded ports, mode, and deadline. It
sends the request through the existing same-origin `/api/query` route and
returns the existing playground response unchanged.

This creates a shared agent-and-person workflow. An agent can discover the
right profile, run a bounded query, and place the result in the visible
playground. A person can inspect the overview, game data, source provenance,
warnings, and raw JSON, then change the populated controls and continue
manually. Before WebMCP, an agent could call controls heuristically or return a
detached answer, but it could not use the site's product contract while leaving
an inspectable result behind for the person.

The implementation feature-detects `document.modelContext` and registers two
imperative, document-scoped tools only on the playground. Both tools are
read-only; query output is marked untrusted because server names, MOTDs, rules,
and player data come from external systems. Agent and human submissions share
one cancellable request coordinator, so a newer request aborts the previous one
and late responses cannot overwrite current UI. Tool registration uses one
cleanup signal and rolls back if either registration fails. Browsers without
WebMCP keep the ordinary site with no polyfill or additional network authority.

## Demo storyboard (under three minutes)

Use a project-owned or explicitly approved public game server. Rehearse once
with the same game, ports, and mode that will appear in the recording.

1. **0:00-0:15 — Frame the problem.** Open <https://query.host/> in ChatGPT's
   in-app browser or WebMCP-enabled Chrome. Say that QueryHost turns six
   game-specific query protocols into one safe, inspectable playground.
2. **0:15-0:40 — Discover capabilities.** Ask the browser agent to call
   `list_supported_games`. Show the canonical IDs, defaults, recommended modes,
   and capabilities coming from `queryhost@1.0.0`.
3. **0:40-1:25 — Run an approved live query.** Ask the agent to call
   `query_game_server` for the approved server. Mention that the request uses
   the same-origin public route, private API, validation, and deadline as the
   human form.
4. **1:25-2:05 — Inspect the shared result.** Show that the form, advanced
   controls, share URL, query path, warnings, tabs, and JSON now reflect the
   agent's exact request and response.
5. **2:05-2:30 — Continue manually.** Change the mode or another appropriate
   field in the populated form and run the next query by hand. This is the key
   person-and-agent handoff.
6. **2:30-2:50 — Close on trust and openness.** Show the WebMCP documentation
   and public repository. Call out read-only annotations, untrusted server
   output, feature detection, Apache-2.0 licensing, and the signed post–August
   25 implementation commit.

Keep the final video public, under three minutes, and audible. Avoid spending
recording time on setup, terminal output, or unsuccessful targets.

## Final submission checklist

- Production health returns `{"status":"ok"}`.
- The playground exposes exactly `list_supported_games` and
  `query_game_server` in the recording browser.
- The approved live query succeeds and visibly updates the playground.
- The public video is under three minutes and includes audio.
- The primary repository is public and GitHub detects Apache-2.0.
- The Devpost description, live URL, video URL, and repository URL are final.
