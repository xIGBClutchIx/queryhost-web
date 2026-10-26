import compression from "compression";
import {
  createServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerResponse,
} from "node:http";

import { cacheControlForPath } from "../lib/site.js";

/** The Node request handler exported by the Astro adapter's server entry. */
export type SiteHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void | Promise<void>;

export interface SiteServerOptions {
  readonly host: string;
  readonly port: number;
}

// Server-sent events and streamed query progress must reach the client as each
// line is written, so they stay uncompressed even though their media types are
// compressible.
function shouldCompress(
  request: IncomingMessage,
  response: ServerResponse,
): boolean {
  const contentType = response.getHeader("Content-Type");
  if (typeof contentType === "string") {
    const mediaType = contentType.toLowerCase();
    if (
      mediaType.startsWith("text/event-stream") ||
      mediaType.startsWith("application/x-ndjson")
    ) {
      return false;
    }
  }

  return compression.filter(request, response);
}

function requestPathname(request: IncomingMessage): string {
  try {
    return new URL(request.url ?? "/", "http://localhost").pathname;
  } catch {
    return "/";
  }
}

/**
 * The path's cache policy is set before Astro runs, and an error Astro renders
 * itself never replaces it. Server errors must not be cached, so the policy
 * becomes `no-store` as the status line is written.
 */
function preventServerErrorCaching(response: ServerResponse): void {
  const writeHead = response.writeHead.bind(response);
  response.writeHead = ((
    ...args: Parameters<ServerResponse["writeHead"]>
  ): ServerResponse => {
    if (args[0] >= 500) response.setHeader("Cache-Control", "no-store");
    return writeHead(...args);
  }) as ServerResponse["writeHead"];
}

/**
 * Wraps the Astro handler so static files share the site's cache policy and
 * every compressible response is negotiated with gzip or Brotli.
 */
export function createSiteRequestListener(
  handler: SiteHandler,
): RequestListener {
  const compress = compression({ filter: shouldCompress });

  return (request, response) => {
    // The adapter serves files from `dist/client` before Astro middleware runs,
    // so the policy is applied here. Rendered responses replace these values.
    response.setHeader(
      "Cache-Control",
      cacheControlForPath(requestPathname(request)),
    );
    response.setHeader("X-Content-Type-Options", "nosniff");
    preventServerErrorCaching(response);

    compress(request, response, (error) => {
      if (error !== undefined) {
        response.statusCode = 500;
        response.end();
        return;
      }

      Promise.resolve(handler(request, response)).catch(() => {
        if (!response.headersSent) {
          response.statusCode = 500;
        }
        response.end();
      });
    });
  };
}

/** Starts the production HTTP server around the Astro handler. */
export function startSiteServer(
  handler: SiteHandler,
  options: SiteServerOptions,
): Server {
  const server = createServer(createSiteRequestListener(handler));
  server.listen(options.port, options.host, () => {
    console.log(`QueryHost web listening on ${options.host}:${options.port}`);
  });
  return server;
}
