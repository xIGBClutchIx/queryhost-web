# QueryHost Web: how to build with these components

QueryHost is a dark, keyboard-first site for querying game servers. Components are on `window.QueryHostWeb` and are styled with plain global CSS classes plus `var(--*)` tokens. There is no theme provider and no utility-class system.

## Setup

- `styles.css` sets the dark theme on `html`/`body` (`--background`, `--text`, Geist). Keep the page background dark. If you render inside your own container, give it `background: var(--background); color: var(--text)`. Light surfaces aren't part of this system.
- No provider is needed. `Header`, `DocsLayout` and `PolicyLayout` are full-page shells: render each one once, at the top level.
- `DocsLayout` collapses to `DocsMobileNavigation` below 50rem (800px), and `DocsMobileNavigation` is hidden above that width. Don't render both navigations yourself; `DocsLayout` already does.
- `hostname` props take a bare host such as `"query.host"` or `"docs.query.host"`. Docs `href`s look like `"/results/"`.

## Tokens (defined in `styles.css` via `_ds_bundle.css`)

- Surfaces: `--background`, `--surface`, `--surface-raised`, `--surface-subtle`, `--code-background`
- Text: `--text-strong`, `--text`, `--muted`, `--faint`, `--code-text`
- Lines: `--line`, `--line-strong`
- Accent (teal): `--accent`, `--accent-strong`, `--accent-soft`, `--on-accent`
- Status: `--supported` (blue), `--warning`, `--warning-soft`
- Other: `--shadow`, `--header-height`, `--content-width`
- Fonts: `"Geist Variable"` for UI, `"Geist Mono Variable"` for code and numbers

## Class vocabulary you can reuse

- Buttons: `button` + `.button`, primary `.button.button--primary` (teal fill)
- Docs content: wrap prose in `.doc-prose`, put a small uppercase label above a heading with `.eyebrow`
- Tables: `table.data-table`; inline status with `.status.status--supported` / `.status--conditional`
- Code samples: `figure.code-block` > `figcaption` (label + `span.code-block__language`) + `pre > code`. The `CodeBlock` component isn't shipped because it highlights on the server, so use this markup instead.
- Form fields: `.field` > `span` label + `input` + optional `small` help text; selects use the `CustomSelect` component

Read `_ds_bundle.css` for the full rules before inventing new styles. Each component's `.prompt.md` and `.d.ts` hold its props.

## Example

```jsx
const { DocsLayout, Callout } = window.QueryHostWeb;

<DocsLayout
  activeHref="/results/"
  eyebrow="Response contract"
  title="Result semantics"
  description="How QueryHost separates server facts, game data, and provenance."
  hostname="docs.query.host"
>
  <h2>Partial success</h2>
  <p>
    A required-source failure produces <code>ok: false</code>.
  </p>
  <Callout title="Missing is not empty" tone="info">
    <p>An omitted player list means QueryHost could not confirm it.</p>
  </Callout>
  <table className="data-table">
    <thead>
      <tr>
        <th>Source</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          <code>a2s-info</code>
        </td>
        <td>
          <span className="status status--supported">Supported</span>
        </td>
      </tr>
    </tbody>
  </table>
  <a className="button button--primary" href="/querying/">
    Query a server
  </a>
</DocsLayout>;
```
