import type { APIRoute } from "astro";

import { handlePublicApiGames } from "../../../server/public-api.js";

export const ALL: APIRoute = ({ request }) => handlePublicApiGames(request);
