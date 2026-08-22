// @ts-check
import node from "@astrojs/node";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  build: { format: "directory" },
  output: "server",
  server: { host: "0.0.0.0" },
  vite: {
    build: {
      sourcemap: true,
    },
  },
});
