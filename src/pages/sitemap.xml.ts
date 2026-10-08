import type { APIRoute } from "astro";

import { renderSitemap } from "../lib/sitemap.js";

const SITEMAP = renderSitemap();

export const GET: APIRoute = () =>
  new Response(SITEMAP, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
    status: 200,
  });
