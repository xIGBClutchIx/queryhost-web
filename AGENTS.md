# Working in QueryHost Web

This repository contains the public site and documentation service. It owns `query.host`, including documentation under `/docs/`, while consuming QueryHost only through its packaged public contract.

## Boundaries

- Keep this a portable Node.js service with no protocol or game-query implementation.
- Treat `queryhost` as the only game registry and generated API-reference source.
- Keep the private API token and future query proxy entirely server-side.
- Do not add accounts, billing, persistence, monitoring, or a separate documentation service.
- Bounded, process-local usage counters are allowed when every key comes from a closed set, they never record hosts, callers, or results, and any report is token-gated. External monitoring services, collectors, and stored metrics are not.
- Keep TypeScript strict and do not use explicit `any` or `unknown`.
- Preserve the accessible dark theme and responsive keyboard-first behavior.

## Finish gate

Run `npm run verify`. For visual changes, also inspect the built site at desktop and mobile widths.

Use a concise commit subject. Add a list-form commit body when the change spans multiple meaningful concerns. Push, deploy, publish, or expose domains only when the current request authorizes that action. Prepare and verify the requested work first; ask once if authorization or the destination remains unresolved.
