import type { APIRoute } from "astro";

import {
  createDefaultPublicQueryDependencies,
  handlePublicQuery,
  type PublicQueryDependencies,
} from "../../server/public-query.js";

let dependencies: PublicQueryDependencies | undefined;

function publicQueryDependencies(): PublicQueryDependencies {
  dependencies ??= createDefaultPublicQueryDependencies();
  return dependencies;
}

export const POST: APIRoute = ({ request }) =>
  handlePublicQuery(request, publicQueryDependencies());

export const ALL: APIRoute = ({ request }) =>
  handlePublicQuery(request, publicQueryDependencies());
