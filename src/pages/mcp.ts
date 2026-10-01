import type { APIRoute } from "astro";
import {
  createMcpDependencies,
  handleMcpRequest,
  type McpDependencies,
} from "../server/mcp.js";
import { publicQueryDependencies } from "../server/query-dependencies.js";

let dependencies: McpDependencies | undefined;

export const ALL: APIRoute = ({ request }) => {
  dependencies ??= createMcpDependencies(publicQueryDependencies());
  return handleMcpRequest(request, dependencies);
};
