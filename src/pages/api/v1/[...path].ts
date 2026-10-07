import type { APIRoute } from "astro";

import { handlePublicApiNotFound } from "../../../server/public-api.js";

// Specific routes such as query.ts and games.ts take precedence over this one.
export const ALL: APIRoute = ({ request }) => handlePublicApiNotFound(request);
