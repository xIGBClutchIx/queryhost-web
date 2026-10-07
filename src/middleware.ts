import { defineMiddleware } from "astro:middleware";

import {
  cacheControlForPath,
  DOCS_HOSTNAME,
  documentationHref,
  requestHostname,
  SITE_HOSTNAME,
} from "./lib/site.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const hostname = requestHostname(context.request);
  const pathname = context.url.pathname;

  // Documentation moved to query.host/docs/. Keep old links working with a
  // permanent redirect.
  if (hostname === DOCS_HOSTNAME && pathname !== "/health") {
    const target =
      pathname === "/docs" || pathname.startsWith("/docs/")
        ? pathname
        : documentationHref(pathname);
    return context.redirect(
      `https://${SITE_HOSTNAME}${target}${context.url.search}`,
      301,
    );
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
