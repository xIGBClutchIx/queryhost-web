import type { APIRoute } from "astro";

import { handlePublicApiQuery } from "../../../server/public-api.js";
import { publicApiDependencies } from "../../../server/query-dependencies.js";

export const ALL: APIRoute = ({ request }) =>
  handlePublicApiQuery(request, publicApiDependencies());
