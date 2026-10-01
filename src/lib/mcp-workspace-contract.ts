import { z } from "zod";

export const WORKSPACE_URI = "ui://queryhost/query-app-v1.html";
export const FULL_RESULT_KEY = "queryhost/fullResult";
export const FULL_RESULT_LIMIT = 2_097_152;

const gameSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultPort: z.number().optional(),
  defaultQueryPort: z.number().optional(),
  queryPortStrategy: z.enum(["offset", "fixed"]).optional(),
});

export const workspaceCatalogSchema = z.object({ games: z.array(gameSchema) });
export const workspaceResultSchema = z.object({
  input: z.object({
    game: z.string(),
    host: z.string(),
    port: z.number().optional(),
    queryPort: z.number().optional(),
    mode: z.enum(["summary", "full"]).optional(),
    timeoutMs: z.number().optional(),
  }),
  summary: z.string(),
  playgroundUrl: z.url().refine((value) => {
    const url = new URL(value);
    return url.origin === "https://query.host" && url.pathname === "/";
  }),
  result: z.record(z.string(), z.json()),
});

export type WorkspaceGame = z.infer<typeof gameSchema>;
export type WorkspaceResult = z.infer<typeof workspaceResultSchema>;
