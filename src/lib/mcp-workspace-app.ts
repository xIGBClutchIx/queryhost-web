import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { JsonObject, JsonValue } from "./playground-contracts.js";
import {
  FULL_RESULT_KEY,
  workspaceCatalogSchema,
  workspaceResultSchema,
  type WorkspaceGame,
  type WorkspaceResult,
} from "./mcp-workspace-contract.js";
import {
  minecraftEdition,
  stripMinecraftFormatting,
} from "./minecraft-text.js";

export interface WorkspaceBridge {
  query(
    this: void,
    input: JsonObject,
    signal: AbortSignal,
  ): Promise<CallToolResult>;
  open(this: void, url: string): Promise<void>;
  context(
    this: void,
    input: WorkspaceResult["input"],
    summary: string,
  ): Promise<void>;
}

function object(value: JsonValue | undefined): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

/** Owns one mounted workspace; all network calls go through the host bridge. */
export function mountWorkspace(doc: Document, bridge: WorkspaceBridge) {
  const element = <T extends HTMLElement>(
    id: string,
    constructor: { new (): T },
  ): T => {
    const node = doc.getElementById(id);
    if (!(node instanceof constructor))
      throw new Error(`Missing workspace element: ${id}`);
    return node;
  };
  const form = element("query-form", HTMLFormElement);
  const game = element("game", HTMLSelectElement);
  const host = element("host", HTMLInputElement);
  const port = element("port", HTMLInputElement);
  const queryPort = element("query-port", HTMLInputElement);
  const mode = element("mode", HTMLSelectElement);
  const timeout = element("timeout", HTMLSelectElement);
  const query = element("query", HTMLButtonElement);
  const cancel = element("cancel", HTMLButtonElement);
  const status = element("status", HTMLParagraphElement);
  const listeners = new AbortController();
  let games: WorkspaceGame[] = [];
  let connected = false;
  let disposed = false;
  let generation = 0;
  let pending: AbortController | undefined;
  let current: WorkspaceResult | undefined;

  const text = (id: string, value: string) => {
    element(id, HTMLElement).textContent = value;
  };
  const show = (id: string, visible: boolean) => {
    element(id, HTMLElement).hidden = !visible;
  };
  const display = (value: JsonValue | undefined) =>
    value === undefined
      ? "—"
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  const defaults = () => {
    const selected = games.find((item) => item.id === game.value);
    port.value = "";
    port.placeholder =
      selected?.defaultPort === undefined
        ? "Required"
        : String(selected.defaultPort);
    port.required = selected?.id === "a2s";
    queryPort.value = "";
    queryPort.placeholder =
      selected?.defaultQueryPort === undefined
        ? "Automatic"
        : String(selected.defaultQueryPort);
    queryPort.disabled = selected?.id === "a2s";
    show("query-port-label", !queryPort.disabled);
    mode.value = game.value === "minecraft-java" ? "summary" : "full";
    text(
      "port-help",
      game.value === "a2s"
        ? "Enter the actual A2S query port."
        : selected?.defaultQueryPort === undefined
          ? "Leave the port blank to use the game’s default."
          : selected.queryPortStrategy === "fixed"
            ? "The query port defaults independently of the game port."
            : "A custom game port preserves the default query-port offset.",
    );
  };
  const selectTab = (name: string, focus = false) => {
    for (const button of doc.querySelectorAll<HTMLButtonElement>(
      "[data-tab]",
    )) {
      const active = button.dataset["tab"] === name;
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
      show(`panel-${button.dataset["tab"]}`, active);
      if (active && focus) button.focus();
    }
  };
  const rows = (id: string, data: JsonObject) => {
    const panel = element(id, HTMLElement);
    panel.replaceChildren();
    if (Object.keys(data).length === 0) {
      const empty = doc.createElement("p");
      empty.className = "muted";
      empty.textContent = "No details were returned.";
      panel.append(empty);
    }
    for (const [key, value] of Object.entries(data)) {
      const row = doc.createElement("div");
      row.className = "detail-row";
      const label = doc.createElement("p");
      label.className = "muted";
      label.textContent = key;
      const detail = doc.createElement(
        typeof value === "object" && value !== null ? "pre" : "p",
      );
      detail.textContent =
        typeof value === "object" && value !== null
          ? JSON.stringify(value, null, 2)
          : display(value);
      row.append(label, detail);
      panel.append(row);
    }
  };
  const render = (output: CallToolResult) => {
    const parsed = workspaceResultSchema.safeParse(
      output._meta?.[FULL_RESULT_KEY] ?? output.structuredContent,
    );
    if (!parsed.success) {
      status.textContent = output.isError
        ? "The query could not complete. Check the inputs and try again."
        : "The host returned an invalid query result.";
      return;
    }
    current = parsed.data;
    const result = current.result;
    const server = object(result["server"]);
    const players = object(server["players"]);
    show("empty", false);
    show("result", true);
    text(
      "result-host",
      current.input.port === undefined
        ? current.input.host
        : `${current.input.host}:${current.input.port}`,
    );
    text(
      "result-game",
      games.find((item) => item.id === current?.input.game)?.name ??
        current.input.game,
    );
    const success = result["ok"] === true;
    const badge = element("result-state", HTMLElement);
    badge.className = `badge ${success ? "success" : "failure"}`;
    badge.textContent = success
      ? result["partial"] === true
        ? "Partial result"
        : "Query succeeded"
      : "Query failed";
    const overview = element("panel-overview", HTMLElement);
    overview.replaceChildren();
    if (success) {
      const stats = doc.createElement("dl");
      stats.className = "stats";
      const values = [
        [
          "Players",
          `${display(players["online"])} / ${display(players["max"])}`,
        ],
        [
          "Query RTT",
          server["queryRttMs"] === undefined
            ? "—"
            : `${typeof server["queryRttMs"] === "number" ? Math.round(server["queryRttMs"] * 10) / 10 : display(server["queryRttMs"])} ms`,
        ],
        ["Version", display(server["version"])],
        ["Map", display(server["map"])],
      ];
      for (const [label, value] of values) {
        const group = doc.createElement("div");
        const dt = doc.createElement("dt");
        const dd = doc.createElement("dd");
        dt.textContent = label ?? "";
        dd.textContent = value ?? "";
        group.append(dt, dd);
        stats.append(group);
      }
      overview.append(stats);
      const motdValue = object(result["data"])["motd"] ?? server["motd"];
      const plainMotd =
        typeof motdValue === "string" ? motdValue : object(motdValue)["plain"];
      if (typeof plainMotd === "string") {
        const motd = doc.createElement("p");
        const edition = minecraftEdition(current.input.game);
        motd.textContent =
          edition === undefined
            ? plainMotd
            : stripMinecraftFormatting(plainMotd, edition);
        overview.append(motd);
      }
    } else {
      const error = object(result["error"]);
      const message = doc.createElement("p");
      message.textContent = `${display(error["code"])}: ${display(error["message"])}. A failed query does not prove the server is offline.`;
      overview.append(message);
    }
    rows("panel-data", {
      ...(result["server"] === undefined ? {} : { server }),
      ...object(result["data"]),
      ...(result["rawData"] === undefined
        ? {}
        : { rawData: result["rawData"] }),
    });
    rows(
      "panel-sources",
      Object.fromEntries(
        ["sources", "warnings", "cache", "projection"].flatMap((key) => {
          const value = result[key];
          return value === undefined ? [] : [[key, value]];
        }),
      ),
    );
    text("json", JSON.stringify(result, null, 2));
    const limited =
      output._meta?.["queryhost/detailLimited"] === true ||
      object(result["projection"])["truncated"] === true;
    show("detail-notice", limited);
    text(
      "detail-notice",
      "Some details exceed the display limit. Open QueryHost for the complete result.",
    );
    status.textContent = success
      ? "Result updated."
      : "Query failed. You can change the inputs and try again.";
    // Never include server-provided text in app-supplied model context.
    void bridge
      .context(
        current.input,
        success
          ? "Query succeeded. See the query tool result for details."
          : "Query failed; server availability is unconfirmed.",
      )
      .catch(() => {});
  };
  const finish = () => {
    pending = undefined;
    cancel.hidden = true;
    form.setAttribute("aria-busy", "false");
    query.textContent = "Query";
  };
  const cancelQuery = () => {
    generation++;
    pending?.abort();
    finish();
    status.textContent = "Query cancelled. Previous results remain visible.";
  };
  const submitQuery = (event: Event) => {
    event.preventDefault();
    if (!connected || !form.reportValidity()) return;
    host.setCustomValidity(
      host.value.trim() === "" || /[\s/?#@[\]%]/u.test(host.value.trim())
        ? "Use a hostname or IP address without URL syntax."
        : "",
    );
    if (!host.reportValidity()) return;
    const input: JsonObject = {
      game: game.value,
      host: host.value.trim(),
      mode: mode.value,
      timeoutMs: Number(timeout.value),
      ...(port.value === "" ? {} : { port: Number(port.value) }),
      ...(queryPort.disabled || queryPort.value === ""
        ? {}
        : { queryPort: Number(queryPort.value) }),
    };
    pending?.abort();
    const controller = new AbortController();
    pending = controller;
    const request = ++generation;
    form.setAttribute("aria-busy", "true");
    cancel.hidden = false;
    query.textContent = "Query again";
    status.textContent = `Querying ${host.value.trim()}…`;
    void bridge
      .query(
        input,
        AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]),
      )
      .then((output) => {
        if (!disposed && request === generation) render(output);
      })
      .catch(() => {
        if (!disposed && request === generation)
          status.textContent =
            "The query was interrupted or could not complete. Try again.";
      })
      .finally(() => {
        if (request === generation) finish();
      });
  };
  // Sandboxed hosts may omit allow-forms; never depend on native form navigation.
  form.addEventListener("submit", submitQuery, { signal: listeners.signal });
  query.addEventListener("click", submitQuery, { signal: listeners.signal });
  form.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter" && event.target instanceof HTMLInputElement)
        submitQuery(event);
    },
    { signal: listeners.signal },
  );
  host.addEventListener(
    "input",
    () => {
      host.setCustomValidity("");
    },
    {
      signal: listeners.signal,
    },
  );
  game.addEventListener("change", defaults, { signal: listeners.signal });
  cancel.addEventListener("click", cancelQuery, { signal: listeners.signal });
  for (const button of doc.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
    button.addEventListener(
      "click",
      () => {
        selectTab(button.dataset["tab"] ?? "overview");
      },
      { signal: listeners.signal },
    );
    button.addEventListener(
      "keydown",
      (event) => {
        const tabs = Array.from(
          doc.querySelectorAll<HTMLButtonElement>("[data-tab]"),
        );
        const index = tabs.indexOf(button);
        const next =
          event.key === "ArrowRight"
            ? (index + 1) % tabs.length
            : event.key === "ArrowLeft"
              ? (index + tabs.length - 1) % tabs.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : -1;
        if (next >= 0) {
          event.preventDefault();
          selectTab(tabs[next]?.dataset["tab"] ?? "overview", true);
        }
      },
      { signal: listeners.signal },
    );
  }
  element("open", HTMLButtonElement).addEventListener(
    "click",
    () => {
      if (current)
        void bridge.open(current.playgroundUrl).catch(() => {
          status.textContent = "The host could not open QueryHost.";
        });
    },
    { signal: listeners.signal },
  );
  element("copy", HTMLButtonElement).addEventListener(
    "click",
    () => {
      if (!navigator.clipboard) {
        status.textContent =
          "Copy is unavailable. Select the JSON text to copy it.";
        return;
      }
      if (current)
        void navigator.clipboard
          .writeText(JSON.stringify(current.result, null, 2))
          .then(() => {
            status.textContent = "JSON copied.";
          })
          .catch(() => {
            status.textContent =
              "Copy is unavailable. Select the JSON text to copy it.";
          });
    },
    { signal: listeners.signal },
  );
  return {
    result(output: CallToolResult) {
      if (disposed) return;
      const catalog = workspaceCatalogSchema.safeParse(
        output.structuredContent,
      );
      if (catalog.success) {
        if (games.length > 0) return;
        games = catalog.data.games;
        for (const item of games) {
          const option = doc.createElement("option");
          option.value = item.id;
          option.textContent = item.name;
          game.append(option);
        }
        game.value = games.some((item) => item.id === "minecraft-java")
          ? "minecraft-java"
          : (games[0]?.id ?? "");
        defaults();
        game.disabled = false;
        query.disabled = !connected || games.length === 0;
        status.textContent = connected
          ? "Ready to query."
          : "Connecting to ChatGPT…";
      } else if (!pending) render(output);
    },
    ready() {
      connected = true;
      query.disabled = games.length === 0;
      status.textContent = games.length
        ? "Ready to query."
        : "Waiting for the game catalog…";
    },
    failed() {
      status.textContent =
        "This host could not connect the app. Use query.host or QueryHost’s inline tools.";
    },
    cancel: cancelQuery,
    dispose() {
      disposed = true;
      generation++;
      pending?.abort();
      listeners.abort();
    },
  };
}
