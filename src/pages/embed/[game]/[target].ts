import type { APIRoute } from "astro";

import { handleEmbedRequest } from "../../../server/embed.js";
import { badgeService } from "../../../server/query-dependencies.js";

export const ALL: APIRoute = ({ params, request }) =>
  handleEmbedRequest(
    request,
    { game: params["game"] ?? "", target: params["target"] ?? "" },
    badgeService(),
  );
