# Working in QueryHost Web

This repository contains the public site and documentation service. It owns `query.host` and `docs.query.host` while consuming QueryHost only through its packaged public contract.

## Boundaries

- Keep this a portable Node.js service with no protocol or game-query implementation.
- Treat `queryhost` as the only game registry and generated API-reference source.
- Keep the private API token and future query proxy entirely server-side.
- Do not add accounts, billing, persistence, monitoring, or a separate documentation service.
- Keep TypeScript strict and do not use explicit `any` or `unknown`.
- Preserve the accessible dark theme and responsive keyboard-first behavior.

## Finish gate

Run `npm run verify`. For visual changes, also inspect the built site at desktop and mobile widths.

Use a concise commit subject. Add a list-form commit body when the change spans multiple meaningful concerns. Do not deploy, publish, push, or attach domains without explicit approval.
