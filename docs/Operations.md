# Operations

The public QueryHost application is one Railway Node.js service that hosts the playground and documentation. Browser requests terminate at this service; production queries then cross Railway private networking to the separate API service with a server-only origin token.

## Production baseline

- one web replica in Railway US East, co-located with the API
- 0.5 vCPU and 0.5 GB maximum per replica
- `npm start` with `GET /health` as the Railway health check; it runs `dist/server/main.mjs`, which wraps Astro's handler to compress responses (Brotli or gzip) and apply the site cache policy to static files
- Serverless disabled so the first request does not wait for a sleeping container
- restart on failure with at most three retries
- one Railway-generated service domain retained for validation and rollback
- `query.host` attached to the public web service; documentation is served under `/docs/` (the former `docs.query.host` domain was removed on October 7, 2026)
- no public domain on the API service

The web service receives `QUERYHOST_API_BASE_URL` and `QUERYHOST_API_ORIGIN_TOKEN` as server-only variables. The token should reference the API service variable inside Railway rather than being copied into browser-visible configuration. Caller-admission variables remain bounded and should be changed only alongside their tests. The playground reads them as `QUERYHOST_WEB_*`, the public API as `QUERYHOST_WEB_PUBLIC_API_*`, and MCP tool queries as `QUERYHOST_WEB_MCP_*`; names and defaults are listed on the Hosted service documentation page and in [MCP](MCP.md#hosting-and-limits).

The Railway workspace uses a $5 compute email alert and a $10 compute hard limit. The hard limit intentionally stops workloads instead of allowing an open-ended bill. Recheck these workspace-wide values before placing unrelated projects in the same workspace.

## Usage counters

Cloudflare's proxied DNS record supplies HTTP traffic analytics while Railway continues to host the application. Caller rate limits accept `CF-Connecting-IP` only when Railway's `X-Real-IP` identifies a Cloudflare proxy address from the published ranges in `src/server/client-address.ts`; direct origin requests cannot select their identity with that header. MCP preserves these headers when forwarding a tool query internally. Keep those ranges current with Cloudflare's published IPv4 and IPv6 lists.

`GET /api/stats` reports aggregate counters since the web process started: for the playground, the public API, and MCP tool queries separately, requests rejected as invalid, rate limited by gate bound (`active`, `callerActive`, `window`, `caller`, `callers`), forwarded by upstream status and cache outcome, and unavailable; full versus `304` responses from `/api/v1/games`; and, under `api`, the private API's own `GET /stats` (`null` if it cannot be read). Every key comes from a closed set, so the report never contains targets, callers, or results, and it resets on restart.

The route answers `404` unless `QUERYHOST_WEB_STATS_TOKEN` (32 to 256 characters, server-only) is set, and then requires `Authorization: Bearer <token>`:

```bash
curl -H "Authorization: Bearer $QUERYHOST_WEB_STATS_TOKEN" https://query.host/api/stats
```

## Deployment verification

After a deployment or infrastructure change:

1. Wait for Railway to report the web and API deployments as successful.
2. Confirm the web service still has one US East replica, the 0.5 vCPU and 0.5 GB ceilings, and Serverless disabled.
3. Confirm the API still has no generated or custom public domain.
4. Request the web service's `/health` endpoint and require HTTP `200`.
5. Run one approved game-server query through the public web route and require a successful web-to-private-API response.
6. Inspect both services' logs for the same request window. Logs must not contain the target host, request body, player data, origin token, or arbitrary exception contents.
7. Check CPU and memory metrics before raising either replica ceiling.

For WebMCP releases, also open `query.host` in a compatible browser and require
exactly `list_supported_games`, `query_game_server`, and `compare_game_servers` to be discoverable. Invoke
the registry tool, run one approved query, cancel one in-flight query, and confirm
that each agent query updates the visible playground. Chrome's Lighthouse
registered-WebMCP-tools audit provides an independent discovery check.

For remote MCP releases, connect an MCP client to `/mcp`, verify initialization,
list all three tools, and exercise structured query and comparison results. Confirm
`Cache-Control: no-store`, cancellation, invalid-input rejection, and MCP caller
limits. See [MCP connection and limits](MCP.md) before creating a ChatGPT connection.

Do not use arbitrary public game servers for deployment tests. Use a server owned by the project operator or explicitly approved for testing.

## Initial production validation

The August 31, 2026 production baseline passed these checks through the Railway-generated web domain:

- `/health` returned HTTP `200` after the region and resource changes.
- One approved Minecraft Java query completed through web to the private API.
- Twelve simultaneous identical requests produced eight HTTP `200` responses and four immediate HTTP `429` responses with `Retry-After: 1`.
- The eight accepted requests caused one live API miss and seven coalesced responses, proving the burst did not become eight game-server queries.
- After the caller window expired, two sequential requests produced a miss followed by an in-memory cache hit.
- Live Railway metrics reported the 0.5 vCPU and 0.5 GB ceilings, with the web process using about 0.05 GB at rest.
- On September 2, `query.host`, `docs.query.host`, and the public health endpoint each returned HTTP `200` after the custom-domain cutover.

This is a bounded baseline, not a capacity claim. Unique-destination and global admission tests require an approved target set and must not be simulated by probing arbitrary hosts or ports.

## Library releases

This service pins an exact `queryhost` version. The `QueryHost release` workflow opens the pull request that moves the pin. The library's publish workflow starts it with the released version as soon as npm publishes, using the library repository's `QUERYHOST_CONSUMER_DISPATCH_TOKEN` secret; it also checks npm every 15 minutes as the fallback, and running it by hand from the Actions tab, optionally with a version, starts it at once. The same change runs locally with `node scripts/bump-queryhost.mjs [version]`.

`.github/workflows/queryhost-release.yml` here only holds the triggers, the `queryhost-release` concurrency group, the commit title, the API gate settings, and the permissions it grants. The steps live in the API repository's reusable `.github/workflows/consumer-bump.yml`, called at `xIGBClutchIx/queryhost-api/...@main`, which the API also uses, so a fix there reaches both consumers on their next run without a change here. The API repository is public, so the call needs no Actions access setting; if it becomes private, its Settings, Actions, General, Access must allow repositories owned by the same user. The job that installs and imports the new release holds only a read token, and the job that commits, opens, and merges runs no package code and rebuilds every file from the base commit. Each run still checks out this repository and runs this repository's `scripts/bump-queryhost.mjs`.

The pull request carries the pin, the lockfile, prose that names the old pin, the library changelog entries, and any new game IDs. GitHub does not start pull-request workflows for pull requests opened by `GITHUB_TOKEN`, so the workflow dispatches CI on the branch itself. It needs **Allow GitHub Actions to create and approve pull requests** enabled under Settings, Actions, General.

Each later scheduled run merges that pull request, which deploys, once all of these hold:

- it is open, not a draft, opened by `github-actions[bot]` from `queryhost/v<version>` into the default branch, and still titled `Update queryhost to <version>`
- it still holds only the bot's single commit
- it modifies only `package.json`, `package-lock.json`, and the prose files the bump may touch, with no renames, and both pin exactly that version
- it is current with the default branch, mergeable, and the default branch has not moved since the run read it
- every `verify` run on its head commit passed
- Codex, if it has reviewed that head commit, reports no unresolved findings; a missing review does not hold the merge
- the latest successful Railway deployment of `xIGBClutchIx/queryhost-api` in `queryhost / production` pins the same or a newer `queryhost` in the same major version

The API check exists because the API validates game IDs against its own pin: a site that lists a game before the API knows it sends visitors `BAD_REQUEST`. A newer minor or patch release only adds games, so an API that is already ahead is safe. Until every condition holds, each run leaves a notice and tries again 15 minutes later. A merge made with `GITHUB_TOKEN` starts no push workflows, so once GitHub reports the pull request merged, the workflow dispatches CI on the default branch, and Railway deploys once it passes.

To stop an automatic merge, close the pull request or mark it draft. Reopen it or mark it ready to let the schedule continue, or merge it by hand. Pushing any commit to its branch, such as a typecheck fix, also turns the merge over to a person, as does the default branch moving ahead of it.

New games, protocols, sources, source labels, and error or warning codes need no change here: the OpenAPI document, the MCP result schema, the playground's source labels, and the Errors page read the library's exported vocabulary, `QUERY_SOURCE_LABELS`, and its code guidance. If a release does break this service's checks, the failed `verify` check is the safe stop: it holds the merge until a person pushes a fix to the release branch, and because the branch then changes source files, that person reviews and merges it by hand.

## Rollback

Keep the Railway-generated web domain available while custom domains are introduced. If a web deployment is unhealthy:

1. Open the web service's deployment history and redeploy the most recent known-good deployment.
2. Wait for `/health` to pass before testing the playground.
3. Run one approved query through `/api/query` to verify the private API connection.
4. If the application is healthy but private queries fail, verify the private API base URL, origin-token reference, region, and API health before changing code.
5. If an infrastructure change caused the failure, restore only that setting and redeploy; do not expose the API or add another service as a workaround.

After the custom-domain cutover, leave DNS pointed at the last healthy web service during an application rollback. Remove or change public DNS only when the Railway service itself cannot safely receive traffic.
