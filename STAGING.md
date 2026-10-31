# Staging

The `web-staging` service runs the same build as production against the staging API. It consumes the exact `queryhost` version pinned in `package.json`, the same public npm release production uses, so staging never needs a separately packed library.

The server-only `QUERYHOST_API_BASE_URL` references `api-staging.RAILWAY_PRIVATE_DOMAIN` on port 3000. `QUERYHOST_API_ORIGIN_TOKEN` references that service's staging-only origin token. Browser queries continue to use same-origin `POST /api/query`. The staging Railway hostname keeps site and documentation navigation on the same preview origin. Every other variable is optional; see [Operations](docs/Operations.md#environment-variables).

Run `npm ci` and `npm run verify`, then upload this branch's worktree with:

```bash
railway up . --path-as-root --project b3ce842c-00b1-4322-a160-74d7c04fe696 --environment b5a25f67-54b8-40df-a05f-acf2e308dfa3 --service 0fdef66d-8091-427b-b12f-a9561d6000c3 --detach
```

Game choices, source labels, error codes, and the API reference all come from the installed package, so a library release reaches staging with only the version bump.

## History

Staging was first used for the initial game-support test, deployed with a package packed from library commit `c33e128` before the library was published to npm.
