# QueryHost Web

The public QueryHost website, query playground, and documentation service. One portable Astro/Node.js application serves `query.host` and `docs.query.host` with a shared design system and hostname-aware entry routing.

The browser sends non-secret query inputs to the same-origin `POST /api/query` route. That server route validates and throttles callers before forwarding production requests to the private QueryHost API over Railway networking. During local development, the same route calls the installed `queryhost` package directly, without duplicating any game protocol implementation.

## WebMCP

The playground registers two imperative WebMCP tools when the browser exposes `document.modelContext`:

- `list_supported_games` returns the package-owned game registry, ports, recommended modes, and capabilities.
- `query_game_server` uses the existing same-origin query route and renders the same result in the visible playground.

Both tools are read-only. Game-server responses are marked as untrusted content because names, MOTDs, rules, and player data come from external servers. Unsupported browsers keep the complete human interface without a polyfill. See the [WebMCP tools documentation](https://docs.query.host/webmcp/), [hackathon submission guide](docs/WebMCPSubmission.md), and current [WebMCP draft](https://webmachinelearning.github.io/webmcp/).

This WebMCP integration was added after August 25, 2026 for the WebMCP hackathon in signed commit [`ceaa6d2`](https://github.com/xIGBClutchIx/queryhost-web/commit/ceaa6d213855d5780ad0fe7826c3dc599402b5e8). Its implementation is isolated to the web application and does not add browser APIs to the portable library or private API.

## Development

Requirements: Node.js 24 and npm 12.

```bash
npm install
npm run dev
```

No API environment variables are required for `npm run dev`; localhost performs live queries through the installed QueryHost library. Its normal public-target policy remains active.

Production requires these server-only variables:

```text
QUERYHOST_API_BASE_URL=http://api.railway.internal:3000
QUERYHOST_API_ORIGIN_TOKEN=<shared private token>
```

The private origin and token must never use a `PUBLIC_` prefix. Optional `QUERYHOST_WEB_*` variables tune the bounded caller gate, request size, and upstream deadline; production defaults are documented on the Hosted service page.

Local and preview hosts use `/` for the site and `/docs/` for documentation so every internal link remains on the current origin. Only the canonical `query.host` and `docs.query.host` domains use cross-origin navigation; production requests to `docs.query.host` map clean documentation paths to the same internal pages.

Run the complete gate before committing:

```bash
npm run verify
```

## Library dependency

The web service pins exact `queryhost@1.0.0` from the public npm registry for the game registry, public types, and generated API Markdown. Do not copy or maintain a second game list in this repository.

## Source repositories

- [QueryHost web and WebMCP integration](https://github.com/xIGBClutchIx/queryhost-web)
- [QueryHost hosted API source (private runtime)](https://github.com/xIGBClutchIx/queryhost-api)
- [QueryHost TypeScript library](https://github.com/xIGBClutchIx/queryhost)

## Deployment

`npm run build` creates a standalone Node.js server. Railway runs `npm start`, checks `/health`, and keeps Serverless disabled initially. Production runs one 0.5 vCPU, 0.5 GB replica in the same US East region as the private API. The web service talks to the API through its private Railway hostname. `query.host` and `docs.query.host` point to the web service, and its Railway-generated domain remains available for rollback.

See [docs/Operations.md](docs/Operations.md) for the production baseline, verification steps, and rollback procedure.

## License

Apache-2.0
