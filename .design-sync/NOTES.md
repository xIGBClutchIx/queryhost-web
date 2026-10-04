# Design sync notes (queryhost-web)

- This repo is an Astro app, not a published package. `.design-sync/entry.ts` is the bundle entry; it re-exports the site's React components from `src/components/`. Add new reusable components there and to `componentSrcMap`.
- No `dist/` `.d.ts` tree exists, so `buildCmd` emits declarations into `dist/types` (gitignored; the converter finds it via `findTypesRoot`). Run `buildCmd` before every converter run. The repo pins TypeScript 6 as `npx tsc6`; plain `tsc` is not installed.
- `dtsPropsFor` hand-writes props for DocsSidebar/DocsMobileNavigation (their props interface isn't exported) and for CustomSelect/QueryResult/QueryPlayground (generics and `queryhost` types the extractor can't flatten). These are copies of the source types, so update them when those props change.
- `CodeBlock` is excluded: `src/lib/highlight.ts` runs Shiki with top-level await on the server, which can't go into the browser IIFE. The conventions header teaches the `.code-block` markup instead.
- The Header's brand icon is `/favicon.svg?v=2` (root-relative), which doesn't resolve in Claude Design. `.design-sync/brand-icon.css` (imported by the entry, so it lands in `_ds_bundle.css`) sets `.brand__icon { content: url(data:...) }` with the inlined `public/favicon.svg`.
- Preview harness bodies are white. Every preview wraps stories in a `Page` div with `background: var(--background)` to match the site's dark `body`.
- Layout cards need wide viewports (`overrides.*.viewport`), or the site's 50rem breakpoint switches them to mobile layout. DocsMobileNavigation needs a narrow viewport (420px) because it is `display: none` above 50rem.
- Interaction-only states (CustomSelect open, QueryResult tabs, mobile nav open) are previewed by clicking the real trigger in a `useEffect`. There is no prop for them.
- The `games` arrays in QueryResult/QueryPlayground previews are a six-game snapshot of `PLAYGROUND_GAMES` taken at queryhost 1.3.0.
- Validate needs playwright 1.56.x in `.ds-sync/` to match the cached chromium-1194 at `/opt/pw-browsers`.
- `guidelinesGlob` is `[]` because `docs/*.md` holds ops/MCP docs, not design guidance.

## Known render warns

- DocsMobileNavigation renders blank in validate's 1200px contact-sheet grid. That's expected because it's hidden above 50rem. Its declared 420px viewport renders correctly in the product and the review captures.

## Re-sync risks

- `dtsPropsFor` bodies and the preview `GAMES` snapshot drift silently when `queryhost` or the playground contracts change.
- `brand-icon.css` inlines `public/favicon.svg`. Re-inline it if the logo changes.
- The preview `Open`/tab stories rely on class names and ids (`.custom-select__trigger`, `#query-tab-*`, `summary`). A rename turns them into closed/default renders without an error.
- The build assumed Node 22 even though `engines` asks for >=24. The site's own `build:mcp-app` isn't needed for the sync.
