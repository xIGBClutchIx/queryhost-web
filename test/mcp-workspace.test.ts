// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import template from "../src/lib/mcp-workspace.html?raw";
import {
  mountWorkspace,
  type WorkspaceBridge,
} from "../src/lib/mcp-workspace-app.js";
import { FULL_RESULT_KEY } from "../src/lib/mcp-workspace-contract.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const catalog: CallToolResult = {
  content: [],
  structuredContent: {
    games: [
      { id: "minecraft-java", name: "Minecraft Java", defaultPort: 25565 },
      { id: "a2s", name: "Generic A2S" },
      {
        id: "rust",
        name: "Rust",
        defaultPort: 28015,
        defaultQueryPort: 28016,
        queryPortStrategy: "offset",
      },
    ],
  },
};
function output(host = "test.example.com"): CallToolResult {
  return {
    content: [],
    structuredContent: {
      input: { game: "minecraft-java", host },
      summary: "Untrusted server text",
      playgroundUrl: "https://query.host/?host=test.example.com",
      result: {
        ok: true,
        server: {
          players: { online: 0, max: 20 },
          queryRttMs: 0,
          motd: "<img src=x onerror=alert(1)>",
        },
        data: { rules: [] },
        sources: [],
        warnings: [],
      },
    },
  };
}
function input(id: string): HTMLInputElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLInputElement)) throw new Error(id);
  return node;
}
function select(id: string): HTMLSelectElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLSelectElement)) throw new Error(id);
  return node;
}
function button(id: string): HTMLButtonElement {
  const node = document.getElementById(id);
  if (!(node instanceof HTMLButtonElement)) throw new Error(id);
  return node;
}
function setup(
  query = vi.fn<WorkspaceBridge["query"]>().mockResolvedValue(output()),
) {
  document.documentElement.innerHTML = template.replace(
    /<!doctype html>/iu,
    "",
  );
  const bridge: WorkspaceBridge = {
    query,
    open: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockResolvedValue(undefined),
  };
  const workspace = mountWorkspace(document, bridge);
  workspace.result(catalog);
  workspace.ready();
  input("host").value = "test.example.com";
  return { workspace, bridge, query };
}
async function submit() {
  button("query").click();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
afterEach(() => {
  vi.restoreAllMocks();
});
describe("query workspace", () => {
  it("opens without querying and preserves game-specific defaults and A2S requirements", async () => {
    const { workspace, query } = setup();
    workspace.result(catalog);
    expect(select("game").options).toHaveLength(3);
    expect(query).not.toHaveBeenCalled();
    expect(select("mode").value).toBe("summary");
    expect(button("query").type).toBe("button");
    select("game").value = "a2s";
    select("game").dispatchEvent(new Event("change"));
    expect(input("query-port").disabled).toBe(true);
    expect(input("port").required).toBe(true);
    expect(select("mode").value).toBe("full");
    await submit();
    expect(query).not.toHaveBeenCalled();
    input("port").value = "27015";
    await submit();
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        game: "a2s",
        port: 27015,
        timeoutMs: 5000,
        mode: "full",
      }),
      expect.any(AbortSignal),
    );
    expect(query.mock.calls[0]?.[0]).not.toHaveProperty("queryPort");
    workspace.dispose();
  });
  it("queries with Enter without requiring sandbox form-submission permission", async () => {
    const { workspace, query } = setup();
    input("host").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
    expect(query).toHaveBeenCalledOnce();
    workspace.dispose();
  });
  it("reads the plain MOTD from game data and rounds RTT without rounding away zero", async () => {
    const result = output();
    result.structuredContent = {
      ...result.structuredContent,
      result: {
        ok: true,
        server: { queryRttMs: 51.2062, players: { online: 0 } },
        data: {
          motd: { plain: "Hosted by Nodecraft.com", html: "<b>untrusted</b>" },
        },
      },
    };
    const { workspace } = setup(vi.fn().mockResolvedValue(result));
    await submit();
    const overview = document.getElementById("panel-overview");
    expect(overview?.textContent).toContain("51.2 ms");
    expect(overview?.textContent).toContain("Hosted by Nodecraft.com");
    expect(overview?.textContent).toContain("0 / —");
    expect(overview?.querySelector("b")).toBeNull();
    workspace.dispose();
  });
  it("shows Minecraft MOTDs without § formatting codes", async () => {
    const result = output();
    result.structuredContent = {
      ...result.structuredContent,
      result: { ok: true, server: {}, data: { motd: "§f§f§lHALLOWEEN EVENT" } },
    };
    const { workspace } = setup(vi.fn().mockResolvedValue(result));
    await submit();
    const overview = document.getElementById("panel-overview");
    expect(overview?.textContent).toContain("HALLOWEEN EVENT");
    expect(overview?.textContent).not.toContain("§");
    workspace.dispose();
  });
  it("uses full UI metadata, renders zero safely, and shares only bounded trusted context", async () => {
    const full = output();
    full._meta = {
      [FULL_RESULT_KEY]: {
        ...full.structuredContent,
        result: {
          ...(full.structuredContent?.["result"] as object),
          data: {
            players: Array.from({ length: 25 }, (_, index) => ({
              name: `Player ${index}`,
            })),
          },
        },
      },
    };
    const { workspace, bridge } = setup(vi.fn().mockResolvedValue(full));
    await submit();
    expect(document.getElementById("panel-overview")?.textContent).toContain(
      "0 / 20",
    );
    expect(document.getElementById("panel-overview")?.textContent).toContain(
      "0 ms",
    );
    expect(document.getElementById("panel-data")?.textContent).toContain(
      "Player 24",
    );
    expect(document.querySelector("img")).toBeNull();
    expect(JSON.stringify(vi.mocked(bridge.context).mock.calls)).not.toContain(
      "Untrusted server text",
    );
    button("tab-overview").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    expect(button("tab-data").getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(button("tab-data"));
    button("open").click();
    expect(bridge.open).toHaveBeenCalledWith(
      "https://query.host/?host=test.example.com",
    );
    workspace.dispose();
  });
  it("ignores older completions and cancelled results and disposes listeners", async () => {
    let first: ((result: CallToolResult) => void) | undefined;
    const query = vi
      .fn<WorkspaceBridge["query"]>()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockResolvedValue(output("new.example.com"));
    const { workspace } = setup(query);
    await submit();
    input("host").value = "new.example.com";
    await submit();
    expect(query.mock.calls[0]?.[1].aborted).toBe(true);
    first?.(output("old.example.com"));
    await Promise.resolve();
    expect(document.getElementById("result-host")?.textContent).toBe(
      "new.example.com",
    );
    let late: ((result: CallToolResult) => void) | undefined;
    query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          late = resolve;
        }),
    );
    await submit();
    button("cancel").click();
    late?.(output("cancelled.example.com"));
    await Promise.resolve();
    expect(document.getElementById("result-host")?.textContent).toBe(
      "new.example.com",
    );
    workspace.dispose();
    document
      .getElementById("query-form")
      ?.dispatchEvent(new Event("submit", { cancelable: true }));
    expect(query).toHaveBeenCalledTimes(3);
  });
  it("handles invalid links, failures, truncation, and unavailable clipboard", () => {
    const { workspace } = setup();
    const unsafe = output();
    unsafe.structuredContent = {
      ...unsafe.structuredContent,
      playgroundUrl: "https://evil.example/",
    };
    workspace.result(unsafe);
    expect(document.getElementById("result")?.hidden).toBe(true);
    const failure = output();
    failure.isError = true;
    failure.structuredContent = {
      ...failure.structuredContent,
      result: {
        ok: false,
        error: { code: "TIMEOUT", message: "Timed out" },
        projection: { truncated: true },
      },
    };
    workspace.result(failure);
    expect(document.getElementById("panel-overview")?.textContent).toContain(
      "does not prove the server is offline",
    );
    expect(document.getElementById("detail-notice")?.hidden).toBe(false);
    button("copy").click();
    expect(document.getElementById("status")?.textContent).toContain(
      "Copy is unavailable",
    );
    workspace.dispose();
  });
});
