# design-sync notes (QueryHost Web)

- This repo is an Astro site, not a published package: there is no `dist/`. The bundle is built from the repo-owned entry `.design-sync/entry.ts` (`cfg.entry`), which re-exports `src/components/**` directly.
- `CodeBlock` is excluded (user decision, 2026-10-04): `src/lib/highlight.ts` creates the Shiki highlighter behind a top-level `await`, which esbuild cannot emit in an IIFE, and Shiki is server-only by design. Its `.code-block` CSS still ships.
- Nothing from `queryhost` (the protocol package) can be bundled for the browser: it imports `node:net`, `node:dgram`, `node:dns/promises`, and wasm. So `PLAYGROUND_GAMES` is not exported, and the playground previews use an inline slice of the registry projection (`PlaygroundGameDefinition[]`).
- `node_modules` can predate the React switch; run `npm ci` first (React missing -> `react not found under --node-modules`).
- npm 12 blocks install scripts; esbuild still works through its platform package without its postinstall.
- Playwright: `.ds-sync/` pins `playwright@1.62.0`, which matches the cached `chromium-1234` in `%LOCALAPPDATA%/ms-playwright`.
- `docs/*.md` are operations notes, not design guidelines; `guidelinesGlob: []` keeps them out of the design agent's context.
- Header's brand icon is `<img src="/favicon.svg?v=2">`, which has no site root in Claude Design. `.design-sync/brand-assets.css` (imported from `entry.ts`, so it lands in `_ds_bundle.css`) paints the real `public/favicon.svg` into `.brand__icon` with CSS `content:`.
- With no `.d.ts` tree, the extractor emits empty `[key: string]: unknown` props. Every component's API is hand-written in `cfg.dtsPropsFor`; keep it in sync with the component's props interface in `src/components/`.
- Windows: a shell whose working directory is inside `ds-bundle/` locks it, and the build's `rmSync` then fails with `EPERM`. Run every sync command from the repo root.
- Preview cards have a white body; QueryHost is dark-only, so every preview wraps its stories in a `var(--background)` surface.
- `QueryPlayground` previews cover idle form states only. Loading and result states need a live `fetch` to `/api/query`; `QueryResult` previews cover the result views.
- `.query-game-summary span` uppercases every span inside the MOTD, including the colored spans in `motdHtml` (visible in `QueryResult/Online`). This is site behavior, not a preview bug.

## Known render warns

- `[RENDER_THIN]` DocsMobileNavigation: the validator renders at desktop width, where `.docs-mobile-nav` is `display:none` (it shows only below 50rem). The card declares a 390x700 viewport, and the captures show it rendering correctly.

## Re-sync risks

- `brand-assets.css` inlines a copy of `public/favicon.svg`; update it when the icon changes.
- Preview game fixtures (`QueryResult.tsx`, `QueryPlayground.tsx`) and the reference labels in `DocsSidebar.tsx` are hand-copied from `queryhost@1.3.0` and the site navigation; they go stale if the registry shape or `ServerInfo` changes.
- `cfg.dtsPropsFor` is a hand copy of each component's props; prop changes in `src/components/` won't reach the design agent until it is updated.
- `entry.ts` lists the exported components by hand; a new component in `src/components/` needs an export there plus a `componentSrcMap` entry.
- The policy date and copy in `PolicyLayout.tsx` are sample content, not the real policy text.
