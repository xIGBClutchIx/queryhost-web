import {
  App,
  applyDocumentTheme,
  applyHostStyleVariables,
  type McpUiHostContext,
} from "@modelcontextprotocol/ext-apps";
import { OpenAIExtensions } from "@openai/mcp-extensions/app";
import { mountWorkspace } from "./mcp-workspace-app.js";

const app = new App(
  { name: "QueryHost workspace", version: "0.2.0" },
  {},
  { strict: true },
);
const extensions = new OpenAIExtensions(app);
const workspace = mountWorkspace(document, {
  query: (input, signal) =>
    app.callServerTool(
      { name: "query_game_server", arguments: input },
      { signal, timeout: 30_000 },
    ),
  open: async (url) => {
    await app.openLink({ url });
  },
  context: async (input, summary) => {
    await extensions.modelContext?.update({
      content: [{ type: "text", text: summary }],
      structuredContent: { input },
    });
  },
});
function theme(context: Partial<McpUiHostContext>) {
  if (context.theme) applyDocumentTheme(context.theme);
  if (context.styles?.variables)
    applyHostStyleVariables(context.styles.variables);
}
app.ontoolresult = (result) => {
  workspace.result(result);
};
app.ontoolcancelled = () => {
  workspace.cancel();
};
app.onhostcontextchanged = theme;
app.onteardown = () => {
  workspace.dispose();
  return {};
};
window.addEventListener(
  "pagehide",
  () => {
    workspace.dispose();
    void app.close();
  },
  { once: true },
);
void app
  .connect()
  .then(() => {
    theme(app.getHostContext() ?? {});
    workspace.ready();
  })
  .catch(() => {
    workspace.failed();
  });
