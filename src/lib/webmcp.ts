import type { PlaygroundGameDefinition } from "./playground-contracts.js";
import {
  queryHostAgentTools,
  type AgentTool,
  type AgentToolHandlers,
} from "./agent-tools.js";

export {
  LIST_SUPPORTED_GAMES_TOOL_NAME,
  QUERY_GAME_SERVER_TOOL_NAME,
  COMPARE_GAME_SERVERS_TOOL_NAME,
} from "./agent-tools.js";

export type WebMcpTool = AgentTool;
export type WebMcpHandlers = AgentToolHandlers;

export interface WebMcpRegisterOptions {
  readonly signal: AbortSignal;
}
export interface WebMcpModelContext {
  unregisterTool?(name: string): void;
  registerTool(
    tool: WebMcpTool,
    options?: WebMcpRegisterOptions,
  ): Promise<void>;
}
export interface WebMcpRegistrationTarget {
  readonly modelContext?: WebMcpModelContext;
}
declare global {
  interface Document {
    readonly modelContext?: WebMcpModelContext;
  }
}
export interface WebMcpRegistration {
  abort(): void;
  readonly ready: Promise<void>;
  readonly signal: AbortSignal;
}
/** Browser tools return agent data and use the visible playground query handler. */
export function queryHostWebMcpTools(
  games: readonly PlaygroundGameDefinition[],
  handlers: WebMcpHandlers,
): readonly WebMcpTool[] {
  return queryHostAgentTools(games, handlers);
}

/** Feature-detects WebMCP and registers the playground tools with bounded cleanup. */
export function registerQueryHostWebMcp(
  target: WebMcpRegistrationTarget,
  games: readonly PlaygroundGameDefinition[],
  handlers: WebMcpHandlers,
): WebMcpRegistration | undefined {
  const modelContext = target.modelContext;
  if (modelContext === undefined) {
    return undefined;
  }

  const controller = new AbortController();
  const registered = new Set<string>();
  function unregister(): void {
    for (const name of registered) modelContext?.unregisterTool?.(name);
    registered.clear();
  }
  controller.signal.addEventListener("abort", unregister, { once: true });
  const ready = (async (): Promise<void> => {
    try {
      for (const tool of queryHostWebMcpTools(games, handlers)) {
        if (controller.signal.aborted) break;
        registered.add(tool.name);
        await modelContext.registerTool(tool, { signal: controller.signal });
        // Registration can settle after disposal in implementations that ignore signals.
        if (controller.signal.aborted) {
          modelContext.unregisterTool?.(tool.name);
          break;
        }
      }
    } catch (error) {
      controller.abort();
      throw error;
    }
  })();

  return {
    abort: () => {
      controller.abort();
    },
    ready,
    signal: controller.signal,
  };
}
