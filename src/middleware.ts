import { defineMiddleware } from "astro:middleware";

import {
  API_HOSTNAME,
  cacheControlForPath,
  DOCS_HOSTNAME,
  internalApiPath,
  internalDocumentationPath,
  isInternalApiPath,
  requestHostname,
} from "./lib/site.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = requestHostname(context.request);
  const pathname = context.url.pathname;

  // The API domain serves only the versioned public API and health; it never
  // exposes site pages, the playground route, or MCP.
  // Rewritten requests re-enter middleware with their internal path, which
  // continues to the route below.
  if (
    hostname === API_HOSTNAME &&
    pathname !== "/health" &&
    !isInternalApiPath(pathname)
  ) {
    const internalPath = internalApiPath(pathname);
    if (internalPath === undefined) {
      return new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "Unknown API route." },
        }),
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-store",
            "Content-Type": "application/json; charset=utf-8",
            "X-Content-Type-Options": "nosniff",
          },
          status: 404,
        },
      );
    }
    return context.rewrite(`${internalPath}${context.url.search}`);
  }

  if (
    hostname === DOCS_HOSTNAME &&
    !pathname.startsWith("/docs/") &&
    pathname !== "/health"
  ) {
    const internalPath = internalDocumentationPath(pathname);
    return context.rewrite(`${internalPath}${context.url.search}`);
  }

  const response = await next();
  response.headers.set("Cache-Control", cacheControlForPath(pathname));
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
  );
  return response;
});
