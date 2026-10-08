import { defineConfig } from "vitest/config";

// Mirrors the Astro integration's Preact compat aliases (and the tsconfig
// `paths` used for types), so components and tests run on Preact.
export default defineConfig({
  resolve: {
    alias: [
      { find: /^react$/u, replacement: "preact/compat" },
      { find: /^react-dom$/u, replacement: "preact/compat" },
      { find: /^react-dom\/client$/u, replacement: "preact/compat/client" },
      { find: /^react-dom\/server$/u, replacement: "preact-render-to-string" },
    ],
  },
});
