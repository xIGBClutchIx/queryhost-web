import type { ReactNode } from "react";

import { CodeBlock } from "./CodeBlock.js";
import { PLAYGROUND_GAMES } from "../lib/playground-games.js";
import { documentationHref } from "../lib/site.js";

interface HomeOverviewProps {
  readonly hostname: string;
}

const NAMED_GAMES = PLAYGROUND_GAMES.filter((game) => game.id !== "a2s");
const installSource = "npm install queryhost";
const querySource = `import { query } from "queryhost";

const result = await query({
  game: "rust",
  host: "play.example.com",
});
console.log(result.ok ? result.server.name : result.error.code);`;

/** Static homepage context below the playground island; it ships no script. */
export function HomeOverview({ hostname }: HomeOverviewProps): ReactNode {
  return (
    <div className="home-overview">
      <section className="home-section" aria-labelledby="home-games-heading">
        <div className="home-section__intro">
          <p className="eyebrow">Supported games</p>
          <h2 id="home-games-heading">
            {NAMED_GAMES.length} games plus generic A2S
          </h2>
          <p>
            Pick a game to preselect it above, or compare what each profile
            reports.
          </p>
          <a
            className="home-section__link"
            href={documentationHref(hostname, "/games/")}
          >
            Compare game capabilities
          </a>
        </div>
        <ul className="home-games">
          {NAMED_GAMES.map((game) => (
            <li key={game.id}>
              <a href={`/?game=${encodeURIComponent(game.id)}`}>{game.name}</a>
            </li>
          ))}
        </ul>
      </section>
      <section className="home-section" aria-labelledby="home-library-heading">
        <div className="home-section__intro">
          <p className="eyebrow">For developers</p>
          <h2 id="home-library-heading">The same queries in your code</h2>
          <p>
            QueryHost is a typed TypeScript library for Node.js. Every result
            this page shows comes from it.
          </p>
          <a className="home-section__link" href={documentationHref(hostname)}>
            Read the getting started guide
          </a>
        </div>
        <div className="home-code">
          <CodeBlock code={installSource} label="Terminal" language="shell" />
          <CodeBlock
            code={querySource}
            label="query.ts"
            language="TypeScript"
          />
        </div>
      </section>
    </div>
  );
}
