# QueryHost Web

The public QueryHost website, query playground, and documentation service. One portable Astro/Node.js application with a Preact interface serves `query.host`, with documentation under `query.host/docs/`.

The browser sends non-secret query inputs to the same-origin `POST /api/query` route, or to `POST /api/detect` when the game picker is set to Auto. That server route validates and throttles callers before forwarding production requests to the private QueryHost API over Railway networking. During local development, the same route calls the installed `queryhost` package directly, without duplicating any game protocol implementation.

## WebMCP

The playground registers three imperative WebMCP tools when the browser exposes `document.modelContext`:

- `list_supported_games` returns the package-owned game registry, ports, recommended modes, and capabilities.
- `query_game_server` returns a summary, playground link, and complete structured result while rendering it in the visible playground.
- `compare_game_servers` queries two to four servers sequentially and returns ordered results, including individual failures.

The same tools are available through the server-side Streamable HTTP MCP endpoint at `/mcp`, for ChatGPT and other remote MCP clients. Production queries continue through the private Railway API. See [MCP connection, contracts, and limits](docs/MCP.md) for ChatGPT developer-mode setup and plugin distribution steps.

All tools are read-only. Game-server responses are marked as untrusted content because names, MOTDs, rules, and player data come from external servers. Unsupported browsers keep the complete human interface without a polyfill. See the [WebMCP tools documentation](https://query.host/docs/webmcp/) and current [WebMCP draft](https://webmachinelearning.github.io/webmcp/).

The WebMCP integration is isolated to the web application and does not add browser APIs to the portable library or private API.

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

The private origin and token must never use a `PUBLIC_` prefix. Optional `QUERYHOST_WEB_*` variables tune the bounded caller gate, the global status-badge budget, the result-preview drawing budget (`QUERYHOST_WEB_PREVIEW_MAX_RENDERS_PER_WINDOW`, default 120 per minute), request size, and upstream deadline; production defaults are documented on the Hosted service page. Setting `QUERYHOST_WEB_STATS_TOKEN` (32 to 256 characters) enables the operator usage report at `GET /api/stats`; see [Operations](docs/Operations.md#usage-counters).

Every host uses `/` for the site and `/docs/` for documentation, so internal links always stay on the current origin.

Astro ClientRouter handles same-origin HTML navigation, including between the site and documentation, with its built-in link prefetching. External links, downloads, modified clicks, and intentional full-page navigation retain their browser behavior.

Every page is a Preact view rendered on the server; the `.astro` routes only read the request and pass it to a view. Components keep React-style imports, which `preact/compat` serves through the Astro integration's aliases and matching TypeScript `paths`. Documentation, policy, and error pages ship no Preact runtime. The playground is the single hydrated Preact island (`client:load`), and result pages (`/{game}/{host}[:port]`, each with a PNG link preview drawn from the badge cache) render prefilled on the server and run once when the page loads; complete `/?game=…&host=…` links redirect to them. Agent tooling and its schema library load as a separate chunk only in browsers that expose WebMCP. The island releases its requests and WebMCP registrations when Astro swaps the page or the browser hides it, and starts again on history restoration. Share URLs retain Astro's history state.

Run the complete gate before committing:

```bash
npm run verify
```

## Library dependency

The web service pins exact `queryhost@1.7.0` from the public npm registry for the game registry, public types, and generated API Markdown. Do not copy or maintain a second game list in this repository.

## Source repositories

- [QueryHost web and WebMCP integration](https://github.com/xIGBClutchIx/queryhost-web)
- [QueryHost hosted API source (private runtime)](https://github.com/xIGBClutchIx/queryhost-api)
- [QueryHost TypeScript library](https://github.com/xIGBClutchIx/queryhost)

## Deployment

`npm run build` creates a standalone Node.js server. Railway runs `npm start`, checks `/health`, and keeps Serverless disabled initially. Production runs one 0.5 vCPU, 0.5 GB replica in the same US East region as the private API. The web service talks to the API through its private Railway hostname. `query.host` points to the web service, and its Railway-generated domain remains available for rollback.

See [docs/Operations.md](docs/Operations.md) for the production baseline, verification steps, and rollback procedure.

## License

Apache-2.0
