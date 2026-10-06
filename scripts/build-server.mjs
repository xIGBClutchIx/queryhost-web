import { build } from "esbuild";

// Bundles the compressing HTTP server next to Astro's standalone entry. The
// adapter import resolves to the built entry so its static and SSR handling
// are reused instead of reimplemented.
await build({
  entryPoints: ["src/server/main.ts"],
  bundle: true,
  outfile: "dist/server/main.mjs",
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "external",
  plugins: [
    {
      name: "astro-server-entry",
      setup(context) {
        context.onResolve({ filter: /^@astrojs\/node\/server\.js$/ }, () => ({
          path: "./entry.mjs",
          external: true,
        }));
      },
    },
  ],
});
