// Browser-safe component entry for the Claude Design sync.
// CodeBlock is excluded: it would bundle Shiki and its grammars, which are server-only.
// The site splits its CSS per page; the design bundle carries every page's rules.
import "../src/styles/base.css";
import "../src/styles/docs.css";
import "../src/styles/playground.css";
import "../src/styles/policy.css";
import "./brand-assets.css";

export { Callout } from "../src/components/Callout.js";
export { DocsLayout } from "../src/components/DocsLayout.js";
export {
  DocsMobileNavigation,
  DocsSidebar,
} from "../src/components/DocsNavigation.js";
export { Header } from "../src/components/Header.js";
export { PolicyLayout } from "../src/components/PolicyLayout.js";
export { TabPanel, Tabs } from "../src/components/Tabs.js";
export { CustomSelect } from "../src/components/playground/CustomSelect.js";
export { QueryPlayground } from "../src/components/playground/QueryPlayground.js";
export { QueryResult } from "../src/components/playground/QueryResult.js";
export { PLAYGROUND_GAMES } from "../src/lib/playground-games.js";
