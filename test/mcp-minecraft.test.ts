// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  minecraftIcon,
  minecraftIdentity,
} from "../src/lib/minecraft-presentation.js";
import { workspaceMetadata } from "../src/server/mcp-workspace-resource.js";
import { compactMcpOutput } from "../src/server/mcp-projection.js";
import { startMcpCards } from "../src/lib/mcp-card-app.js";
import { FULL_RESULT_KEY } from "../src/lib/mcp-workspace-contract.js";
import type { JsonObject } from "../src/lib/playground-contracts.js";

// UI header checks supplement the library's complete PNG validation at the query boundary.
const icon = `data:image/png;base64,${btoa("\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x40\0\0\0\x40")}`;
const output: JsonObject = {
  input: { game: "minecraft-java", host: "test.example.com" },
  summary: "Query succeeded",
  playgroundUrl: "https://query.host/",
  result: {
    ok: true,
    server: { players: { online: 0 } },
    data: {
      favicon: icon,
      motd: {
        plain: "Green <literal>\nNext",
        html: '<span style="color:#55ff55;font-weight:bold">Green &lt;literal&gt;</span><br>Next',
      },
    },
  },
};
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("Minecraft MCP presentation", () => {
  it("retains icons and styled MOTDs only in bounded UI metadata for singles and comparisons", () => {
    for (const value of [output, { results: [output, output] }]) {
      expect(
        JSON.stringify(workspaceMetadata(value)[FULL_RESULT_KEY]),
      ).toContain(icon);
      expect(JSON.stringify(compactMcpOutput(value))).not.toContain(icon);
      expect(JSON.stringify(compactMcpOutput(value))).not.toContain("<span");
    }
  });
  it("rejects remote, SVG, oversized, malformed and non-64px icons", () => {
    expect(minecraftIcon(icon)).toBe(icon);
    const non64 = `data:image/png;base64,${btoa("\x89PNG\r\n\x1a\n\0\0\0\rIHDR\0\0\0\x01\0\0\0\x40")}`;
    for (const value of [
      "https://server.example/icon.png",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png;base64,AAAA",
      icon + "A".repeat(100_000),
      non64,
    ]) {
      expect(minecraftIcon(value)).toBeUndefined();
    }
  });
  it("renders Java component colors, line breaks and literal escaped markup", () => {
    const result = output["result"] as JsonObject;
    const identity = minecraftIdentity(
      document,
      "minecraft-java",
      result["data"] as JsonObject,
      {},
    );
    expect(identity?.querySelector("img")?.src).toBe(icon);
    expect(identity?.querySelector("span")?.style.color).toBe(
      "rgb(85, 255, 85)",
    );
    expect(identity?.querySelector("span")?.style.fontWeight).toBe("bold");
    expect(identity?.querySelector("br")).not.toBeNull();
    expect(identity?.textContent).toContain("<literal>");
    expect(identity?.querySelector("literal")).toBeNull();
    identity?.querySelector("img")?.dispatchEvent(new Event("error"));
    expect(identity?.querySelector("img")).toBeNull();
  });
  it("uses edition-specific legacy formatting, preserves newlines and rejects active markup", () => {
    const bedrock = minecraftIdentity(
      document,
      "minecraft-bedrock",
      { favicon: icon, motd: "§mRed\n§lBold" },
      {},
    );
    expect(bedrock?.textContent).toBe("Red\nBold");
    expect(bedrock?.querySelector("img")).toBeNull();
    expect(bedrock?.querySelector("span")?.style.color).not.toBe("");
    for (const html of [
      '<img src="https://bad.example" onerror="alert(1)">',
      '<span style="background:url(https://bad.example)">bad</span>',
      "<script>alert(1)</script>",
    ]) {
      const identity = minecraftIdentity(
        document,
        "minecraft-java",
        { motd: { plain: "§aSafe <text>", html } },
        {},
      );
      expect(identity?.textContent).toBe("Safe <text>");
      expect(identity?.querySelector("img,script,a")).toBeNull();
    }
    const identity = minecraftIdentity(
      document,
      "minecraft-java",
      {
        motd: {
          plain: "safe",
          html: '<span onclick="alert(1)" style="color:#55ff55">safe</span>',
        },
      },
      {},
    );
    expect(identity?.querySelector("[onclick]")).toBeNull();
    expect(
      minecraftIdentity(
        document,
        "rust",
        { favicon: icon, motd: "§aRust" },
        {},
      ),
    ).toBeUndefined();
  });
  it("hydrates comparison cards from UI metadata and keeps plain fallback when absent", () => {
    document.body.innerHTML = '<main id="cards"></main><p id="status"></p>';
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        disconnect(): void {}
      },
    );
    const send = (data: JsonObject) => {
      const event = new MessageEvent("message", {
        origin: "https://host.example",
        data,
      });
      Object.defineProperty(event, "source", { value: window.parent });
      window.dispatchEvent(event);
    };
    startMcpCards();
    send({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2026-01-26" } });
    const comparison = { results: [output, output] };
    send({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: {
        structuredContent: compactMcpOutput(comparison),
        _meta: workspaceMetadata(comparison),
      },
    });
    expect(document.querySelectorAll(".minecraft-identity img")).toHaveLength(
      2,
    );
    expect(document.querySelectorAll(".minecraft-motd span")).toHaveLength(2);
    expect(document.querySelector(".stats")?.textContent).toContain("0 / —");
    send({
      jsonrpc: "2.0",
      method: "ui/notifications/tool-result",
      params: { structuredContent: compactMcpOutput(output) },
    });
    expect(document.querySelector("img")).toBeNull();
    expect(document.querySelector(".minecraft-motd")?.textContent).toContain(
      "Green <literal>",
    );
    send({ jsonrpc: "2.0", id: 4, method: "ui/resource-teardown" });
  });
});
