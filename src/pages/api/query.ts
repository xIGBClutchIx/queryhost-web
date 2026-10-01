import type { APIRoute } from "astro";

import { handlePublicQuery } from "../../server/public-query.js";
import { publicQueryDependencies } from "../../server/query-dependencies.js";

export const POST: APIRoute = ({ request }) =>
  handlePublicQuery(request, publicQueryDependencies());

export const ALL: APIRoute = ({ request }) =>
  handlePublicQuery(request, publicQueryDependencies());
