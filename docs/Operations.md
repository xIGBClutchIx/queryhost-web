# Operations

The public QueryHost application is one Railway Node.js service that hosts the playground and documentation. Browser requests terminate at this service; production queries then cross Railway private networking to the separate API service with a server-only origin token.

## Production baseline

- one web replica in Railway US East, co-located with the API
- 0.5 vCPU and 0.5 GB maximum per replica
- `npm start` with `GET /health` as the Railway health check
- Serverless disabled so the first request does not wait for a sleeping container
- restart on failure with at most three retries
- one Railway-generated service domain retained for validation and rollback
- `query.host` and `docs.query.host` attached to the public web service
- no public domain on the API service

The web service receives `QUERYHOST_API_BASE_URL` and `QUERYHOST_API_ORIGIN_TOKEN` as server-only variables. The token should reference the API service variable inside Railway rather than being copied into browser-visible configuration. Caller-admission variables remain bounded and should be changed only alongside their tests.

The Railway workspace uses a $5 compute email alert and a $10 compute hard limit. The hard limit intentionally stops workloads instead of allowing an open-ended bill. Recheck these workspace-wide values before placing unrelated projects in the same workspace.

## Deployment verification

After a deployment or infrastructure change:

1. Wait for Railway to report the web and API deployments as successful.
2. Confirm the web service still has one US East replica, the 0.5 vCPU and 0.5 GB ceilings, and Serverless disabled.
3. Confirm the API still has no generated or custom public domain.
4. Request the web service's `/health` endpoint and require HTTP `200`.
5. Run one approved game-server query through the public web route and require a successful web-to-private-API response.
6. Inspect both services' logs for the same request window. Logs must not contain the target host, request body, player data, origin token, or arbitrary exception contents.
7. Check CPU and memory metrics before raising either replica ceiling.

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

## Rollback

Keep the Railway-generated web domain available while custom domains are introduced. If a web deployment is unhealthy:

1. Open the web service's deployment history and redeploy the most recent known-good deployment.
2. Wait for `/health` to pass before testing the playground.
3. Run one approved query through `/api/query` to verify the private API connection.
4. If the application is healthy but private queries fail, verify the private API base URL, origin-token reference, region, and API health before changing code.
5. If an infrastructure change caused the failure, restore only that setting and redeploy; do not expose the API or add another service as a workaround.

After the custom-domain cutover, leave DNS pointed at the last healthy web service during an application rollback. Remove or change public DNS only when the Railway service itself cannot safely receive traffic.
