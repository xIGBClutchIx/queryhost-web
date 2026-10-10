import { once } from "node:events";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
} from "node:http";
import type { AddressInfo } from "node:net";
import { brotliDecompressSync, gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

import {
  createSiteRequestListener,
  type SiteHandler,
} from "../src/server/http-server.js";

interface TestResponse {
  readonly body: Buffer;
  readonly headers: IncomingMessage["headers"];
  readonly status: number | undefined;
}

const LARGE_TEXT = "QueryHost ".repeat(1_000);
let server: Server | undefined;

afterEach(async () => {
  if (server !== undefined) {
    server.close();
    await once(server, "close");
    server = undefined;
  }
});

async function listen(handler: SiteHandler): Promise<number> {
  server = createServer(createSiteRequestListener(handler));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return (server.address() as AddressInfo).port;
}

async function fetchRaw(
  port: number,
  path: string,
  options: { readonly encoding?: string; readonly method?: string } = {},
): Promise<TestResponse> {
  const request = httpRequest({
    host: "127.0.0.1",
    port,
    path,
    method: options.method ?? "GET",
    headers:
      options.encoding === undefined
        ? {}
        : { "Accept-Encoding": options.encoding },
  });
  request.end();
  const [response] = (await once(request, "response")) as [IncomingMessage];
  const chunks: Buffer[] = [];
  for await (const chunk of response) {
    chunks.push(chunk as Buffer);
  }
  return {
    body: Buffer.concat(chunks),
    headers: response.headers,
    status: response.statusCode,
  };
}

// Mirrors `send`, which keeps a Cache-Control header that is already set.
const staticFile: SiteHandler = (_request, response) => {
  if (!response.hasHeader("Cache-Control")) {
    response.setHeader("Cache-Control", "public, max-age=0");
  }
  response.setHeader("Content-Type", "text/javascript; charset=utf-8");
  response.end(LARGE_TEXT);
};

describe("site HTTP server", () => {
  it("gives hashed static assets immutable caching on GET and HEAD", async () => {
    const port = await listen(staticFile);
    for (const method of ["GET", "HEAD"]) {
      const response = await fetchRaw(port, "/_astro/client.abc123.js", {
        method,
      });
      expect(response.headers["cache-control"]).toBe(
        "public, max-age=31536000, immutable",
      );
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("applies the short page policy to other public files", async () => {
    const port = await listen(staticFile);
    const response = await fetchRaw(port, "/favicon.svg?v=2");
    expect(response.headers["cache-control"]).toBe(
      "public, max-age=300, stale-while-revalidate=86400",
    );
  });

  it("lets rendered responses replace the default policy", async () => {
    const port = await listen((_request, response) => {
      response.writeHead(200, { "Cache-Control": "no-store" });
      response.end("ok");
    });
    const response = await fetchRaw(port, "/_astro/missing.js");
    expect(response.headers["cache-control"]).toBe("no-store");
  });

  it("negotiates Brotli and gzip for compressible responses", async () => {
    const port = await listen(staticFile);

    const brotli = await fetchRaw(port, "/_astro/client.js", {
      encoding: "gzip, br",
    });
    expect(brotli.headers["content-encoding"]).toBe("br");
    expect(brotli.headers["vary"]).toContain("Accept-Encoding");
    expect(brotliDecompressSync(brotli.body).toString()).toBe(LARGE_TEXT);

    const gzip = await fetchRaw(port, "/_astro/client.js", {
      encoding: "gzip",
    });
    expect(gzip.headers["content-encoding"]).toBe("gzip");
    expect(gunzipSync(gzip.body).toString()).toBe(LARGE_TEXT);

    const identity = await fetchRaw(port, "/_astro/client.js");
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(identity.body.toString()).toBe(LARGE_TEXT);
  });

  it("leaves streaming events and already-compressed media untouched", async () => {
    const port = await listen((request, response) => {
      response.setHeader(
        "Content-Type",
        request.url === "/events"
          ? "text/event-stream"
          : request.url === "/api/query"
            ? "application/x-ndjson; charset=utf-8"
            : "font/woff2",
      );
      response.end(LARGE_TEXT);
    });

    for (const path of ["/events", "/api/query", "/_astro/geist.woff2"]) {
      const response = await fetchRaw(port, path, { encoding: "gzip, br" });
      expect(response.headers["content-encoding"]).toBeUndefined();
      expect(response.body.toString()).toBe(LARGE_TEXT);
    }
  });

  it("turns a rejected handler into a bare 500", async () => {
    const port = await listen(() => Promise.reject(new Error("render")));
    const response = await fetchRaw(port, "/");
    expect(response.status).toBe(500);
    expect(response.body.length).toBe(0);
  });
});
