# Working in QueryHost Web

This repository contains the public site and documentation service. It owns `query.host`, including documentation under `/docs/`, while consuming QueryHost only through its packaged public contract.

## Boundaries

- Keep this a portable Node.js service with no protocol or game-query implementation.
- Treat `queryhost` as the only game registry and generated API-reference source.
- Keep the private API token and future query proxy entirely server-side.
- Do not add accounts, billing, persistence, monitoring, or a separate documentation service.
- The playground's recent-checks list is the one browser-storage exception: at most a few entries of game, host, and ports, kept only in the visitor's localStorage with a Clear control, never results or player names, and never sent to the server.
- Bounded, process-local usage counters are allowed when every key comes from a closed set, they never record hosts, callers, or results, and any report is token-gated. External monitoring services, collectors, and stored metrics are not.
- Keep TypeScript strict and do not use explicit `any` or `unknown`.
- Preserve the accessible dark theme and responsive keyboard-first behavior.

## Related repositories

Sibling repositories live beside this one. Use these absolute paths; relative paths break inside worktrees.

- `C:\Users\camer\repos\queryhost\query` — the `queryhost` library and game registry. Read it to understand the public contract; library changes are made, released, and then picked up here with a version bump.
- `C:\Users\camer\repos\queryhost\api` — hosted API this site calls with its private token.

Cross-project decisions and their rationale live in `C:\Users\camer\repos\queryhost\query\docs\Decisions.md`. Read it before changing project shape or scope.

## Finish gate

Run `npm run verify`. For visual changes, also inspect the built site at desktop and mobile widths.

Use a concise commit subject. Add a list-form commit body when the change spans multiple meaningful concerns. Push, deploy, publish, or expose domains only when the current request authorizes that action. Prepare and verify the requested work first; ask once if authorization or the destination remains unresolved.
