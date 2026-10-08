import type { APIRoute } from "astro";

import { renderRobots } from "../lib/sitemap.js";

const ROBOTS = renderRobots();

export const GET: APIRoute = () =>
  new Response(ROBOTS, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: 200,
  });
