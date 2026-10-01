import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { describe, expect, it } from "vitest";
import { createMcpDependencies, handleMcpRequest } from "../src/server/mcp.js";
import { ProxyGate } from "../src/server/proxy-gate.js";
import type { PublicQueryDependencies } from "../src/server/public-query.js";
import type { JsonObject } from "../src/lib/playground-contracts.js";
import {
  MCP_CARD_MIME,
  MCP_CARD_URI,
} from "../src/server/mcp-card-resource.js";
import { WORKSPACE_URI } from "../src/server/mcp-workspace-resource.js";
import { FULL_RESULT_KEY } from "../src/lib/mcp-workspace-contract.js";

function setup(body?: string) {
  const calls: RequestInit[] = [];
  const queries: PublicQueryDependencies = {
    config: {
      maxBodyBytes: 2048,
      upstreamTimeoutMs: 7000,
      target: {
        kind: "hosted",
        apiBaseUrl: "http://api.railway.internal:3000",
        apiOriginToken: "a".repeat(32),
      },
    },
    gate: new ProxyGate({
      maxActive: 2,
      maxStartsPerCaller: 8,
      maxStartsPerWindow: 60,
      maxTrackedCallers: 20,
      windowMs: 60_000,
    }),
    fetcher: (_url, init) => {
      calls.push(init);
      return Promise.resolve(
        Response.json(
          body === undefined
            ? {
                ok: true,
                game: "minecraft-java",
                durationMs: 0,
                sources: [],
                warnings: [],
                partial: false,
                server: { players: { online: 0 }, queryRttMs: 0 },
                data: {},
                cache: { status: "miss", ageMs: 0, ttlMs: 0 },
              }
            : JSON.parse(body),
        ),
      );
    },
    queryRunner: () => Promise.reject(new Error("Must use private API.")),
  };
  return { calls, dependencies: createMcpDependencies(queries) };
}

function rpc(
  method: string,
  params: object = {},
  headers: Record<string, string> = {},
): Request {
  return new Request("https://query.host/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

describe("remote MCP", () => {
  it("advertises both app-only entrypoints and opens their catalog without network work", async () => {
    const { dependencies, calls } = setup();
    const discovery = await handleMcpRequest(rpc("tools/list"), dependencies);
    const body = (await discovery.json()) as JsonObject;
    expect(body).toMatchObject({
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({
            name: "open_queryhost",
            title: "QueryHost",
            _meta: {
              ui: { resourceUri: WORKSPACE_URI, visibility: ["app"] },
              "openai/ui": { entrypoints: [{ type: "global" }] },
            },
          }),
          expect.objectContaining({
            name: "open_server_query",
            title: "Server query",
            _meta: {
              ui: { resourceUri: WORKSPACE_URI, visibility: ["app"] },
              "openai/ui": { entrypoints: [{ type: "thread" }] },
            },
          }),
        ]) as object,
      },
    });
    for (const name of ["open_queryhost", "open_server_query"]) {
      const response = await handleMcpRequest(
        rpc("tools/call", { name, arguments: {} }),
        dependencies,
      );
      expect(await response.json()).toMatchObject({
        result: {
          content: [],
          structuredContent: {
            games: expect.arrayContaining([
              expect.objectContaining({ id: "minecraft-java" }),
            ]) as object,
          },
        },
      });
      const invalid = await handleMcpRequest(
        rpc("tools/call", { name, arguments: { host: "example.com" } }),
        dependencies,
      );
      expect(await invalid.json()).toMatchObject({ result: { isError: true } });
    }
    const resource = await handleMcpRequest(
      rpc("resources/read", { uri: WORKSPACE_URI }),
      dependencies,
    );
    expect(await resource.json()).toMatchObject({
      result: {
        contents: [
          {
            uri: WORKSPACE_URI,
            _meta: {
              ui: {
                permissions: { clipboardWrite: {} },
                csp: {
                  connectDomains: [],
                  resourceDomains: [],
                  frameDomains: [],
                },
              },
              "openai/ui": {
                preferredDisplayMode: "fullscreen",
                availableDisplayModes: ["inline", "fullscreen"],
              },
            },
          },
        ],
      },
    });
    expect(calls).toEqual([]);
  });
  it("supports real SDK initialization, tool discovery, data returns and comparison", async () => {
    const { calls, dependencies } = setup();
    const client = new Client({ name: "test", version: "1.0.0" });
    const transport = new StreamableHTTPClientTransport(
      new URL("https://query.host/mcp"),
      {
        fetch: (input, init) =>
          handleMcpRequest(new Request(input, init), dependencies),
      },
    );
    try {
      // The SDK's optional sessionId getter conflicts with exactOptionalPropertyTypes.
      await client.connect(transport as Transport);
      const discovered = (await client.listTools()).tools;
      expect(discovered.map((tool) => tool.name)).toEqual([
        "list_supported_games",
        "query_game_server",
        "compare_game_servers",
        "open_queryhost",
        "open_server_query",
      ]);
      expect(discovered[0]?._meta?.["ui"]).toBeUndefined();
      expect(discovered[1]?._meta?.["ui"]).toEqual({
        resourceUri: MCP_CARD_URI,
        visibility: ["model", "app"],
      });
      expect(discovered[2]?._meta?.["ui"]).toEqual({
        resourceUri: MCP_CARD_URI,
        visibility: ["model", "app"],
      });
      expect((await client.listResources()).resources).toMatchObject([
        { uri: WORKSPACE_URI, mimeType: MCP_CARD_MIME },
        { uri: MCP_CARD_URI, mimeType: MCP_CARD_MIME },
      ]);
      const resource = await client.readResource({ uri: MCP_CARD_URI });
      expect(resource.contents[0]).toMatchObject({
        uri: MCP_CARD_URI,
        mimeType: MCP_CARD_MIME,
        _meta: {
          ui: {
            csp: { connectDomains: [], resourceDomains: [], frameDomains: [] },
          },
        },
      });
      expect(resource.contents[0]).toHaveProperty(
        "text",
        expect.stringContaining("ui/initialize"),
      );
      await expect(
        client.readResource({ uri: "ui://queryhost/missing.html" }),
      ).rejects.toThrow();
      const input = { game: "minecraft-java", host: "play.example.com" };
      const output = await client.callTool({
        name: "query_game_server",
        arguments: input,
      });
      expect(output.isError).toBe(false);
      expect(output._meta?.[FULL_RESULT_KEY]).toMatchObject({
        input,
        result: { ok: true },
      });
      expect(output.structuredContent).toMatchObject({
        input,
        summary: expect.stringContaining("players online: 0") as string,
        playgroundUrl: expect.stringContaining("query.host") as string,
        result: { ok: true, server: { queryRttMs: 0 } },
      });
      const comparison = await client.callTool({
        name: "compare_game_servers",
        arguments: {
          servers: [input, { ...input, host: "other.example.com" }],
        },
      });
      expect(comparison.structuredContent).toMatchObject({
        results: [{ input }, { input: { host: "other.example.com" } }],
      });
      expect(calls).toHaveLength(3);
      expect(
        new Headers(calls[0]?.headers).get("x-queryhost-origin-token"),
      ).toBe("a".repeat(32));
      expect(JSON.stringify(output)).not.toContain("a".repeat(32));
      expect(dependencies.queries.gate.active).toBe(0);
      expect(dependencies.requests.active).toBe(0);
    } finally {
      await client.close();
    }
  });

  it("rejects invalid tool inputs before network work and returns stable errors", async () => {
    const { calls, dependencies } = setup();
    const response = await handleMcpRequest(
      rpc("tools/call", {
        name: "query_game_server",
        arguments: { game: "a2s", host: "example.com" },
      }),
      dependencies,
    );
    expect(await response.json()).toMatchObject({
      result: {
        isError: true,
        content: [
          { text: expect.stringContaining("Invalid tool arguments") as string },
        ],
      },
    });
    expect(calls).toEqual([]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("handles malformed upstream data and mismatched games without leaking exceptions", async () => {
    for (const body of [
      '{"ok":true}',
      '{"error":{"code":"ORIGIN_UNAUTHORIZED","message":"secret internal detail"}}',
    ]) {
      const { dependencies } = setup(body);
      const response = await handleMcpRequest(
        rpc("tools/call", {
          name: "query_game_server",
          arguments: { game: "minecraft-java", host: "example.com" },
        }),
        dependencies,
      );
      const output = (await response.json()) as JsonObject;
      expect(output).toMatchObject({
        result: {
          isError: true,
          structuredContent: {
            result: { error: { code: "UPSTREAM_INVALID" } },
          },
        },
      });
      expect(JSON.stringify(output)).not.toContain("secret internal detail");
    }
  });

  it("shares query admission with browser calls", async () => {
    const { calls, dependencies } = setup();
    const lease1 = dependencies.queries.gate.admit("browser1");
    const lease2 = dependencies.queries.gate.admit("browser2");
    const response = await handleMcpRequest(
      rpc("tools/call", {
        name: "query_game_server",
        arguments: { game: "minecraft-java", host: "example.com" },
      }),
      dependencies,
    );
    expect(await response.json()).toMatchObject({
      result: {
        isError: true,
        structuredContent: { result: { error: { code: "RATE_LIMITED" } } },
      },
    });
    expect(calls).toEqual([]);
    if (lease1.accepted) lease1.release();
    if (lease2.accepted) lease2.release();
  });

  it("bounds methods, origins, bodies, and batches with deterministic cleanup", async () => {
    const { dependencies } = setup();
    expect(
      (
        await handleMcpRequest(
          new Request("https://query.host/mcp"),
          dependencies,
        )
      ).status,
    ).toBe(405);
    expect(
      (
        await handleMcpRequest(
          rpc("tools/list", {}, { Origin: "https://evil.example" }),
          dependencies,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await handleMcpRequest(
          new Request("https://query.host/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "x".repeat(16_385),
          }),
          dependencies,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await handleMcpRequest(
          new Request("https://query.host/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "[]",
          }),
          dependencies,
        )
      ).status,
    ).toBe(400);
    expect(dependencies.requests.active).toBe(0);
    const controller = new AbortController();
    controller.abort();
    const request = new Request(rpc("tools/list"), {
      signal: controller.signal,
    });
    expect((await handleMcpRequest(request, dependencies)).status).toBe(408);
    expect(dependencies.requests.active).toBe(0);
  });
});
