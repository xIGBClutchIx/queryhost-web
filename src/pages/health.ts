import type { APIRoute } from "astro";

export const GET: APIRoute = () =>
  new Response(JSON.stringify({ status: "ok" }), {
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status: 200,
  });
