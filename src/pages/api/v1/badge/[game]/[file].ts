import type { APIRoute } from "astro";

import { handleBadgeRequest } from "../../../../../server/badge.js";
import { badgeService } from "../../../../../server/query-dependencies.js";

export const ALL: APIRoute = ({ params, request }) =>
  handleBadgeRequest(
    request,
    { file: params["file"] ?? "", game: params["game"] ?? "" },
    badgeService(),
  );
