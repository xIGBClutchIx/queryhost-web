import type { JsonObject, JsonValue } from "./playground-contracts.js";

/** Self-contained entry point serialized into the MCP resource after TS compilation.
 * Keep runtime dependencies inside this function so the iframe needs no network access.
 */
export function startMcpCards(): void {
  const root = document.getElementById("cards");
  const status = document.getElementById("status");
  if (!root || !status) return;
  const cards = root;
  const notice = status;
  let initialized = false;
  let hostOrigin: string | undefined;
  let lastHeight = 0;
  let canOpenLinks = false;
  let nextRequestId = 2;
  const pendingLinks = new Map<number, ReturnType<typeof setTimeout>>();
  const initializeTimeout = setTimeout(() => {
    if (!initialized)
      notice.textContent =
        "The host could not connect this card. The query remains available in the conversation.";
  }, 10_000);
  function object(value: JsonValue | undefined): JsonObject {
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  }
  function text(value: JsonValue | undefined): string {
    return typeof value === "string" ? value.slice(0, 512) : "";
  }
  function number(value: JsonValue | undefined): string {
    return typeof value === "number" && Number.isFinite(value)
      ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(
          value,
        )
      : "—";
  }
  function element(tag: string, value = "", className = ""): HTMLElement {
    const node = document.createElement(tag);
    node.textContent = value;
    node.className = className;
    return node;
  }
  function notify(method: string, params: JsonObject = {}): void {
    window.parent.postMessage(
      { jsonrpc: "2.0", method, params },
      hostOrigin ?? "*",
    );
  }
  function resize(): void {
    const height = document.body.scrollHeight;
    if (!initialized || height === lastHeight) return;
    lastHeight = height;
    notify("ui/notifications/size-changed", { height });
  }
  const observer = new ResizeObserver(resize);
  observer.observe(document.body);
  function theme(context: JsonObject): void {
    if (context["theme"] === "dark" || context["theme"] === "light")
      document.documentElement.dataset["theme"] = context["theme"];
    const variables = object(object(context["styles"])["variables"]);
    // Only presentation tokens used by this resource; no host CSS or font fetches.
    for (const [key, property] of [
      ["--color-background-primary", "color"],
      ["--color-background-secondary", "color"],
      ["--color-text-primary", "color"],
      ["--color-text-secondary", "color"],
      ["--color-text-info", "color"],
      ["--color-text-inverse", "color"],
      ["--color-text-success", "color"],
      ["--color-text-warning", "color"],
      ["--color-border-primary", "color"],
      ["--color-border-secondary", "color"],
      ["--color-ring-primary", "color"],
      ["--font-sans", "font-family"],
      ["--font-text-md-size", "font-size"],
      ["--font-weight-normal", "font-weight"],
      ["--font-weight-medium", "font-weight"],
      ["--border-radius-lg", "border-radius"],
    ] as const) {
      const value = variables[key];
      if (
        typeof value === "string" &&
        value.length <= 512 &&
        CSS.supports(property, value)
      )
        document.documentElement.style.setProperty(key, value);
      else if (key in variables)
        document.documentElement.style.removeProperty(key);
    }
    const cursor = variables["--cursor-interaction"];
    if (cursor === "default" || cursor === "pointer")
      document.documentElement.style.setProperty(
        "--cursor-interaction",
        cursor,
      );
    resize();
  }
  function render(output: JsonObject): void {
    const values = Array.isArray(output["results"])
      ? output["results"].slice(0, 4)
      : [output];
    cards.replaceChildren();
    for (const value of values) {
      const envelope = object(value);
      const input = object(envelope["input"]);
      const result = object(envelope["result"]);
      const host = text(input["host"]);
      if (!host || !("ok" in result || "error" in result)) continue;
      const server = object(result["server"]);
      const success = result["ok"] === true;
      const card = element("article", "", "card");
      const article = element("div", "", "server-content");
      const heading = element("div", "", "server-heading");
      const game = text(input["game"])
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
      heading.append(element("p", game, "game"));
      const identity = element("div");
      // Drop Minecraft `§` formatting codes from the display name only.
      const rawName = text(server["name"]);
      const name =
        (text(input["game"]).startsWith("minecraft-")
          ? rawName.replace(/§[0-9a-vx]/giu, "")
          : rawName) || host;
      identity.append(element("h2", name));
      if (name !== host || typeof input["port"] === "number")
        identity.append(
          element(
            "p",
            `${host}${typeof input["port"] === "number" ? `:${input["port"]}` : ""}`,
            "host",
          ),
        );
      heading.append(
        element(
          "p",
          success
            ? result["partial"] === true
              ? "Partial result"
              : "Query succeeded"
            : "Query failed",
          success
            ? result["partial"] === true
              ? "badge partial"
              : "badge success"
            : "badge failure",
        ),
      );
      article.append(heading, identity);
      if (success) {
        const players = object(server["players"]);
        const stats = element("dl", "", "stats");
        for (const [label, value] of [
          [
            "Players",
            `${number(players["online"])} / ${number(players["max"])}`,
          ],
          [
            "Query RTT",
            typeof server["queryRttMs"] === "number"
              ? `${number(server["queryRttMs"])} ms`
              : "—",
          ],
          [
            "Version",
            typeof server["version"] === "string"
              ? text(server["version"]) || "(empty)"
              : "—",
          ],
          [
            "Map",
            typeof server["map"] === "string"
              ? text(server["map"]) || "(empty)"
              : "—",
          ],
        ]) {
          const group = element("div");
          group.append(element("dt", label), element("dd", value));
          stats.append(group);
        }
        article.append(stats);
        const motd = text(object(object(result["data"])["motd"])["plain"]);
        if (motd) article.append(element("p", motd, "motd"));
      } else {
        const error = object(result["error"]);
        article.append(
          element(
            "p",
            `${text(error["code"])}: ${text(error["message"])}`,
            "error",
          ),
        );
        article.append(
          element(
            "p",
            "A failed query does not prove the server is offline.",
            "muted",
          ),
        );
      }
      const warnings = result["warnings"];
      if (Array.isArray(warnings) && warnings.length > 0) {
        const list = element("ul", "", "warnings");
        for (const warning of warnings.slice(0, 20)) {
          const item = object(warning);
          list.append(
            element("li", text(item["message"]) || text(item["code"])),
          );
        }
        article.append(list);
      }
      const sources = result["sources"];
      const diagnostics = element("details", "", "diagnostics");
      const summary = element("summary", "Query details", "cursor-interaction");
      const diagnosticContent = element("div", "", "diagnostic-content");
      diagnostics.append(summary, diagnosticContent);
      if (Array.isArray(sources) && sources.length > 0) {
        const list = element("ul", "", "sources");
        for (const source of sources.slice(0, 20)) {
          const item = object(source);
          list.append(
            element(
              "li",
              `${text(item["source"])} · ${text(item["status"])}${typeof item["rttMs"] === "number" ? ` · ${number(item["rttMs"])} ms` : ""}`,
            ),
          );
        }
        diagnosticContent.append(list);
      }
      if (object(envelope["projection"])["truncated"] === true)
        diagnosticContent.append(
          element(
            "p",
            "Some details are omitted. Open QueryHost for the full result.",
            "muted",
          ),
        );
      const cache = object(result["cache"]);
      if (typeof cache["status"] === "string")
        diagnosticContent.append(
          element(
            "p",
            `Cache: ${text(cache["status"])} · age ${number(cache["ageMs"])} ms`,
            "muted",
          ),
        );
      diagnosticContent.append(
        element(
          "p",
          "Query RTT is measured from QueryHost, not your connection.",
          "muted",
        ),
      );
      article.append(diagnostics);
      // Never navigate to an address supplied by a game server or a forged host message.
      try {
        const url = new URL(text(envelope["playgroundUrl"]));
        if (
          url.origin === "https://query.host" &&
          url.pathname === "/" &&
          !url.username &&
          !url.password
        ) {
          const link = document.createElement("a");
          link.textContent = "Open in QueryHost ↗";
          link.className = "btn cursor-interaction";
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.addEventListener("click", (event) => {
            if (!canOpenLinks) return;
            event.preventDefault();
            if (pendingLinks.size > 0) return;
            const id = nextRequestId++;
            pendingLinks.set(
              id,
              setTimeout(() => {
                pendingLinks.delete(id);
                notice.textContent =
                  "The host did not open the link. Use the QueryHost link in the conversation.";
              }, 10_000),
            );
            window.parent.postMessage(
              {
                jsonrpc: "2.0",
                id,
                method: "ui/open-link",
                params: { url: url.href },
              },
              hostOrigin ?? "*",
            );
          });
          const footer = element("div", "", "card-footer");
          footer.append(link);
          article.append(footer);
        }
      } catch {
        /* A malformed link must not hide the query result. */
      }
      card.append(article);
      cards.append(card);
    }
    notice.textContent =
      cards.childElementCount > 0
        ? ""
        : "No server result was returned. Ask ChatGPT to query a public game server.";
    resize();
  }
  function receive(event: MessageEvent<JsonValue>): void {
    if (event.source !== window.parent) return;
    if (hostOrigin !== undefined && event.origin !== hostOrigin) return;
    const message = object(event.data);
    if (message["jsonrpc"] !== "2.0") return;
    if (message["id"] === 1 && !initialized) {
      const result = object(message["result"]);
      if (result["protocolVersion"] !== "2026-01-26") {
        notice.textContent =
          "The host could not connect this card. The query remains available in the conversation.";
        return;
      }
      // Sandboxed parents can have an opaque origin and require a wildcard target.
      hostOrigin = event.origin === "null" ? undefined : event.origin;
      initialized = true;
      clearTimeout(initializeTimeout);
      canOpenLinks = "openLinks" in object(result["hostCapabilities"]);
      theme(object(result["hostContext"]));
      notify("ui/notifications/initialized");
      resize();
      return;
    }
    if (!initialized) return;
    const requestId = message["id"];
    if (typeof requestId === "number" && pendingLinks.has(requestId)) {
      clearTimeout(pendingLinks.get(requestId));
      pendingLinks.delete(requestId);
      if (message["error"])
        notice.textContent =
          "The host could not open the link. Use the QueryHost link in the conversation.";
      return;
    }
    const params = object(message["params"]);
    switch (message["method"]) {
      case "ui/notifications/tool-result":
        render(object(params["structuredContent"]));
        break;
      case "ui/notifications/tool-cancelled":
        cards.replaceChildren();
        notice.textContent = "Query cancelled. Ask ChatGPT to try again.";
        break;
      case "ui/notifications/host-context-changed":
        theme(params);
        break;
      case "ui/resource-teardown":
        clearTimeout(initializeTimeout);
        for (const timer of pendingLinks.values()) clearTimeout(timer);
        pendingLinks.clear();
        observer.disconnect();
        window.removeEventListener("message", receive);
        window.parent.postMessage(
          { jsonrpc: "2.0", id: message["id"], result: {} },
          hostOrigin ?? "*",
        );
        break;
    }
  }
  window.addEventListener("message", receive);
  window.parent.postMessage(
    {
      jsonrpc: "2.0",
      id: 1,
      method: "ui/initialize",
      params: {
        appInfo: { name: "QueryHost server cards", version: "1.0.0" },
        appCapabilities: { availableDisplayModes: ["inline"] },
        protocolVersion: "2026-01-26",
      },
    },
    "*",
  );
}
