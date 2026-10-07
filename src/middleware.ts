import { defineMiddleware } from "astro:middleware";

import { cacheControlForPath } from "./lib/site.js";

export const onRequest = defineMiddleware(async (context, next) => {
  const pathname = context.url.pathname;

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
