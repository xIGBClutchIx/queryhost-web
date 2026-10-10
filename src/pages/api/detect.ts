import type { APIRoute } from "astro";

import { handlePublicDetect } from "../../server/public-detect.js";
import { publicDetectDependencies } from "../../server/query-dependencies.js";

export const POST: APIRoute = ({ request }) =>
  handlePublicDetect(request, publicDetectDependencies());

export const ALL: APIRoute = ({ request }) =>
  handlePublicDetect(request, publicDetectDependencies());
