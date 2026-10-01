import { afterEach, expect, it, vi } from "vitest";
import { startMcpCards } from "../src/lib/mcp-card-app.js";
import type { JsonObject, JsonValue } from "../src/lib/playground-contracts.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("inherits host presentation at initialization and preserves tokens across partial context updates", () => {
  vi.useFakeTimers();
  const properties = new Map<string, string>();
  const dataset: Record<string, string> = {};
  let listener: ((event: MessageEvent<JsonValue>) => void) | undefined;
  const parent = { postMessage: vi.fn() };
  vi.stubGlobal("window", {
    parent,
    addEventListener: (_name: string, callback: typeof listener) => {
      listener = callback;
    },
    removeEventListener: vi.fn(),
  });
  vi.stubGlobal("document", {
    getElementById: () => ({ textContent: "" }),
    body: { scrollHeight: 240 },
    documentElement: {
      dataset,
      style: {
        setProperty: (key: string, value: string) => properties.set(key, value),
        removeProperty: (key: string) => properties.delete(key),
      },
    },
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  // Browser CSS parsing is exercised by the desktop/mobile bridge check.
  vi.stubGlobal("CSS", { supports: () => true });
  const send = (message: JsonObject, origin = "https://host.example") => {
    const event = new MessageEvent<JsonValue>("message", {
      origin,
      data: message,
    });
    Object.defineProperty(event, "source", { value: parent });
    listener?.(event);
  };
  startMcpCards();
  send({
    jsonrpc: "2.0",
    id: 1,
    result: {
      protocolVersion: "2026-01-26",
      hostContext: {
        theme: "dark",
        styles: {
          variables: {
            "--font-sans": "system-ui",
            "--color-text-primary": "#eeeeee",
            "--cursor-interaction": "default",
            "--unrecognized": "red",
            "--font-text-md-size": "1".repeat(513),
          },
        },
      },
    },
  });
  expect(dataset["theme"]).toBe("dark");
  expect(Object.fromEntries(properties)).toEqual({
    "--font-sans": "system-ui",
    "--color-text-primary": "#eeeeee",
    "--cursor-interaction": "default",
  });
  send({
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: {
      theme: "light",
      styles: { variables: { "--color-text-primary": "#222222" } },
    },
  });
  expect(dataset["theme"]).toBe("light");
  expect(properties.get("--font-sans")).toBe("system-ui");
  expect(properties.get("--color-text-primary")).toBe("#222222");
  send(
    {
      jsonrpc: "2.0",
      method: "ui/notifications/host-context-changed",
      params: {
        theme: "dark",
        styles: { variables: { "--color-text-primary": "red" } },
      },
    },
    "https://forged.example",
  );
  expect(dataset["theme"]).toBe("light");
  expect(properties.get("--color-text-primary")).toBe("#222222");
  send({
    jsonrpc: "2.0",
    method: "ui/notifications/host-context-changed",
    params: {
      styles: { variables: { "--color-text-primary": null } },
    },
  });
  expect(properties.has("--color-text-primary")).toBe(false);
});
