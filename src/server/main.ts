import { startSiteServer } from "./http-server.js";

// The adapter would otherwise start its own uncompressed server on import.
process.env["ASTRO_NODE_AUTOSTART"] = "disabled";

// The build bundles this file next to Astro's server entry and points this
// import at it; see scripts/build-server.mjs.
const { handler } = await import("@astrojs/node/server.js");

const port = Number(process.env["PORT"] ?? "4321");
if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new RangeError("PORT must be an integer between 0 and 65535.");
}

startSiteServer(handler, { host: process.env["HOST"] ?? "0.0.0.0", port });
