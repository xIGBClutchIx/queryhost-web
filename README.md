# QueryHost Web

The public QueryHost website and documentation service. One portable Astro/Node.js application serves `query.host` and `docs.query.host` with a shared design system and hostname-aware entry routing.

The query playground and trusted private-API proxy are added in the next implementation slice. This repository does not query game servers directly.

## Development

Requirements: Node.js 24 and npm 12.

```bash
npm install
npm run dev
```

Local routes use `/` for the site and `/docs/` for documentation. Production requests to `docs.query.host` map clean documentation paths to the same internal pages.

Run the complete gate before committing:

```bash
npm run verify
```

## Library snapshot

`vendor/queryhost-0.0.0.tgz` is the verified package artifact that supplies the game registry, public types, and generated API Markdown. Refresh it only from a verified sibling `query` checkout; do not copy or maintain a second game list in this repository.

## Deployment

`npm run build` creates a standalone Node.js server. Railway runs `npm start`, checks `/health`, and keeps Serverless disabled initially. Domain attachment remains a separate production-readiness step.

## License

Apache-2.0
