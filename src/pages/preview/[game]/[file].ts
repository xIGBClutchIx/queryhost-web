import type { APIRoute } from "astro";

import { handlePreviewRequest } from "../../../server/preview.js";
import { previewService } from "../../../server/query-dependencies.js";

export const ALL: APIRoute = ({ params, request }) =>
  handlePreviewRequest(
    request,
    { file: params["file"] ?? "", game: params["game"] ?? "" },
    previewService(),
  );
