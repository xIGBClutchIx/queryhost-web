import type { APIRoute } from "astro";

import { handlePublicApiOpenApi } from "../../../server/public-api.js";

export const ALL: APIRoute = ({ request }) => handlePublicApiOpenApi(request);
