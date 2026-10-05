# Recommended improvements

Findings from the Claude Design sync (2026-10-04) and a pass over `src/`. They are ordered by payoff within each section. Every item names the file and the evidence, so each one can be picked up on its own.

## Optimizations

1. **Split the stylesheet per page.** `src/styles/global.css` (2,439 lines) builds into one 41 KB file (`Header.*.css`) that every page loads. The playground rules (`.query-*`, `.custom-select*`, about 900 lines) load on docs pages, and the docs and capability-table rules load on the home page. Splitting into `base.css` plus `docs.css`, `playground.css`, and `policy.css`, each imported by the layout or component that uses it, lets Astro emit only what each route needs.
2. **Reconsider shipping source maps.** `astro.config.mjs` sets `vite.build.sourcemap: true`, so `client.*.js.map` (about 1 MB) and `webmcp.*.js.map` are public. That's fine if intentional for an open-source repo. If not, switch to `"hidden"` so maps exist for debugging but aren't served.
3. **Make `highlightCode` lazy.** `src/lib/highlight.ts` creates the Shiki highlighter with a top-level `await`, so the cost is paid when any module importing it loads, and it is why `CodeBlock` can't be bundled anywhere else (it is excluded from the design sync). A memoized `getHighlighter()` promise keeps the same behavior and removes the module-load side effect.
4. **Keep `webmcp` lazy, as it is.** `webmcp.*.js` (93 KB, zod) loads only when `document.modelContext` exists. Keep that rule as the pattern for any future agent-only code.
5. **Stop `QueryResult` re-parsing its JSON.** `QueryResult` runs `JSON.parse(raw)` again just to pretty-print the response body that `QueryPlayground` already parsed. Passing the parsed value (or the formatted string) through `OutputState` removes one parse per result.

## Style and design-system consistency

1. **Collapse the type scale.** `global.css` uses 33 distinct `font-size` values (0.7, 0.72, 0.75, 0.76, 0.78, 0.8, 0.82, 0.86, 0.88, 0.9 rem…) and 15 distinct `font-weight` values (450–720). Define a scale such as `--text-xs/sm/base/lg/xl` and `--weight-regular/medium/semibold/bold`, then map existing values to the nearest step. Most of these differences can't be seen, and the sprawl makes new UI hard to match.
2. **Tokenize radius and motion.** There are 16 distinct `border-radius` values (0.25, 0.35, 0.5, 0.6, 0.75rem…) and 8 transition durations (100–240ms). Add `--radius-sm/md/lg` and `--duration-fast/base` tokens. `src/lib/mcp-workspace.css` already defines `--radius-md`/`--radius-lg`, so align the two.
3. **Replace the remaining raw color.** `.button--primary` uses `color: #07110f` while `--on-accent` (`#04201a`) exists for exactly that role. Use the token, and decide whether the two near-identical values should be one.
4. **Fix MOTD uppercasing.** `.query-game-summary span` uppercases every span, including the colored spans inside a Minecraft `motdHtml`, so server messages render in caps. Use `.query-game-summary > div > span` to target only the "Message of the day" label.
5. **Give the warning Callout its own mark.** `Callout` always renders `i` in `.callout__mark`, including for `tone="warning"`. Use `!` (or an icon) for warnings so the tone shows in the glyph as well as the color.
6. **Name the breakpoints.** The responsive rules use `50rem`, `50.0625rem`, and `34rem` as literals. Comment them as named breakpoints (`--bp-tablet`, `--bp-phone`) or move to custom media, so new components use the same values.

## Modularity

1. **Split the two largest components.**
   - `QueryResult.tsx` (419 lines) contains the toolbar, tabs, four panels, `DataList`, `MinecraftSummaryView`, and `CopyJsonButton`. Move each panel (`OverviewPanel`, `DataPanel`, `SourcesPanel`, `JsonPanel`) and `CopyJsonButton` into `playground/result/`. The tab logic stays in `QueryResult`.
   - `QueryPlayground.tsx` (474 lines) mixes session and WebMCP lifecycle, the request state machine, layout measurement, and the form markup. Extract `usePlaygroundSession()` (session, coordinator, WebMCP registration, pagehide/pageshow), `useDockHeight()`, and a presentational `QueryForm`.
2. **Extract a reusable `Tabs` primitive.** `QueryResult` hand-rolls a tablist with arrow-key handling. A `Tabs` component (ARIA tablist, roving tabindex, Home/End) would be reusable on docs pages and testable on its own.
3. **Deduplicate helpers.** `milliseconds()` is defined identically in `src/lib/playground-form.ts` and `src/lib/query-path.ts`. Keep one, in a small `src/lib/format.ts` that can also hold `readableKey` and `scalarText`.
4. **Make site components data-driven, not module-driven.** `DocsSidebar`/`DocsMobileNavigation` read `DOCUMENTATION_NAVIGATION` directly, and `Header` reads `BRAND_ICON_URL` and `GITHUB_REPOSITORY_URL` from `site.ts`. Optional props with those defaults (`sections`, `iconSrc`) keep current call sites unchanged while making the components reusable in other contexts. The design sync needed a CSS workaround (`.design-sync/brand-assets.css`) only because the icon URL is fixed.
5. **Share one game-fixture module for tests and previews.** The tests and the design-sync previews each hand-build `PlaygroundGameDefinition` and `PlaygroundQueryResponse` objects. A `test/fixtures/playground.ts` used by both would keep them in sync with the `queryhost` types.
6. **Separate the browser-safe registry projection.** `playground-games.ts` imports `listGames()` from `queryhost`, which pulls Node-only transports (`node:net`, `node:dgram`, wasm). If `queryhost` exported a browser-safe `queryhost/registry` entry (definitions only), the games list could be shared with client code and design tooling without going through the server.

## Suggested order

1. Small, safe fixes: MOTD selector, warning mark, `--on-accent`, `milliseconds` dedupe.
2. Token pass: type scale, radius, motion. This is visual, so check it at desktop and mobile widths, per the finish gate.
3. Component splits (`QueryResult`, `QueryPlayground`, `Tabs`). Existing tests in `test/query-playground.test.tsx` cover the behavior.
4. Stylesheet split and the lazy highlighter.
5. Registry entry in `queryhost` (cross-repo).

After the token pass or the component splits, re-run the design sync so Claude Design picks up the new tokens and props (see `.design-sync/NOTES.md`).
