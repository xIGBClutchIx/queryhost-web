import { defineMiddleware } from "astro:middleware";

import { cacheControlForPath, trailingSlashRedirect } from "./lib/site.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

  // Pages answer only at their trailing-slash URL, which is also their canonical one.
  const slashed = trailingSlashRedirect(pathname);
  const response =
    slashed === undefined
      ? await next()
      : new Response(null, {
          headers: { Location: `${slashed}${context.url.search}` },
          status: 301,
        });
  // A route that sets its own caching or CSP (status badges) keeps it; every
  // other response gets the site policy.
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", cacheControlForPath(pathname));
  }
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // Browsers ignore HSTS over plain HTTP, so local development is unaffected.
  response.headers.set(
    "Strict-Transport-Security",
    "max-age=63072000; includeSubDomains",
  );
  response.headers.set("X-Content-Type-Options", "nosniff");
  // Embed cards are the one page other sites may frame; their CSP says so.
  if (!pathname.startsWith("/embed/")) {
    response.headers.set("X-Frame-Options", "DENY");
  }
  if (!response.headers.has("Content-Security-Policy")) {
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'none'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
    );
  }
  return response;
});
