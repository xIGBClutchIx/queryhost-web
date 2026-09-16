# Game-support staging

This branch deploys the site to `web-staging` in the `staging` environment of the existing QueryHost Railway project. It consumes `vendor/queryhost-c33e128.tgz`, packed from verified library commit `c33e128` on `codex/game-support-integration`, without publishing an npm release.

The server-only `QUERYHOST_API_BASE_URL` references `api-staging.RAILWAY_PRIVATE_DOMAIN` on port 3000. `QUERYHOST_API_ORIGIN_TOKEN` references that service's staging-only origin token. Browser queries continue to use same-origin `POST /api/query`. The staging Railway hostname keeps site and documentation navigation on the same preview origin.

Run `npm ci` and `npm run verify`, then upload this branch's worktree with:

```bash
railway up . --path-as-root --project b3ce842c-00b1-4322-a160-74d7c04fe696 --environment b5a25f67-54b8-40df-a05f-acf2e308dfa3 --service 0fdef66d-8091-427b-b12f-a9561d6000c3 --detach
```

The package registry supplies all seven new game choices and generated references. New query sources receive readable path labels, and fixed query ports are described as independent of the game port.
