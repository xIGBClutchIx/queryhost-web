# QueryHost design conventions

QueryHost (query.host, docs.query.host) is a **dark-only**, keyboard-first site for querying game servers. Components come from `window.QueryHost`; styling is plain global CSS (BEM-style class names plus `var(--*)` tokens). There is no provider, theme switch, or CSS-in-JS.

## Setup

- `styles.css` loads the Geist / Geist Mono fonts and the whole site stylesheet. It styles `html` and `body` with `var(--background)` and `var(--text)`, so pages are dark by default. Never place components on a white surface.
- The components need no wrapper. Some styles depend on a page class on an ancestor: `docs-page` (docs gradient), `home-page` (playground backdrop), and `doc-prose` (the typography for docs content, including `Callout`).
- `Header` takes `hostname`: use `"query.host"` for the site and `"docs.query.host"` for docs. `active` is `"site"` or `"docs"`.
- `QueryPlayground` and `QueryResult` take `games: PlaygroundGameDefinition[]` (`id`, `name`, `defaultMode`, `defaultPort`, `capabilities`). Pass a small inline array; the game registry itself is server-only.
- There is no `CodeBlock` component in the bundle. For code, use `<figure className="code-block"><figcaption><span>Label</span><span className="code-block__language">ts</span></figcaption><pre><code>…</code></pre></figure>`.

## Tokens (use these, never raw hex)

| Role     | Tokens                                                                                                   |
| -------- | -------------------------------------------------------------------------------------------------------- |
| Surfaces | `--background`, `--surface`, `--surface-raised`, `--surface-subtle`, `--code-background`                 |
| Text     | `--text-strong`, `--text`, `--muted`, `--faint`, `--code-text`                                           |
| Lines    | `--line`, `--line-strong`                                                                                |
| Accent   | `--accent` (teal), `--accent-strong`, `--accent-soft`, `--on-accent`                                     |
| Status   | `--supported`, `--warning`, `--warning-soft`                                                             |
| Layout   | `--header-height`, `--content-width`, `--docs-sidebar-width`, `--shadow`                                 |
| Type     | `--text-3xs` … `--text-3xl`, `--weight-regular`, `--weight-medium`, `--weight-semibold`, `--weight-bold` |
| Shape    | `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-full`                              |
| Motion   | `--duration-fast`, `--duration-base`, `--duration-slow`                                                  |

Breakpoints are 50rem (tablet) and 34rem (phone). The body font is `"Geist Variable"`. Use `"Geist Mono Variable"` for code, ports, and timings.

## Class vocabulary

- Buttons: `button`, `button button--primary` (on `<a>` or `<button>`).
- Labels: `eyebrow` (small uppercase accent kicker above a heading).
- Docs: `doc-heading`, `doc-prose`, `data-table`, `callout callout--warning`.
- Forms: `field` (a `<label>` wrapping a `<span>` label and an `<input>`), `query-form`, `query-submit`.
- Status: `status status--supported`, `status status--conditional`.
- Screen-reader text: `sr-only`.

Do not invent new class names for these patterns. For your own layout glue, use inline styles with the tokens above.

## Where the truth lives

Before styling, read `_ds_bundle.css`, the full site stylesheet that every class above comes from. Then read each component's `components/<group>/<Name>/<Name>.prompt.md` and `.d.ts`.

## Example

```jsx
const { Header, Callout } = window.QueryHost;

<div className="docs-page" style={{ minHeight: "100vh" }}>
  <Header active="docs" hostname="docs.query.host" />
  <main
    className="doc-prose"
    style={{ maxWidth: "58rem", margin: "0 auto", padding: "3rem 2rem" }}
  >
    <p className="eyebrow">Guide</p>
    <h1 style={{ color: "var(--text-strong)" }}>Hosted service</h1>
    <Callout title="Query port must be reachable" tone="warning">
      <p>
        Rust answers status queries on its query port, usually{" "}
        <code>28017</code>.
      </p>
    </Callout>
    <a className="button button--primary" href="/querying/">
      Query a server
    </a>
  </main>
</div>;
```
