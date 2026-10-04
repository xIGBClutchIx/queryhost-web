// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import { defineConfig } from "astro/config";

export default defineConfig({
  adapter: node({ mode: "standalone" }),
  build: { format: "directory" },
  integrations: [react()],
  output: "server",
  server: { host: "0.0.0.0" },
  vite: {
    build: {
      sourcemap: true,
    },
  },
});
