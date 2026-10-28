import type { ReactNode } from "react";

import { DocsLayout } from "../../components/DocsLayout.js";
import type { DocsPageMetadata } from "../../components/DocsLayout.js";
import { gameAnchor } from "../../lib/docs-search.js";
import { PLAYGROUND_GAMES } from "../../lib/playground-games.js";
import { documentationHref } from "../../lib/site.js";

export const metadata = {
  activeHref: "/credits/",
  contents: true,
  eyebrow: "Acknowledgements",
  title: "Credits",
  description:
    "The people who make QueryHost and the games it was built to query.",
} as const satisfies DocsPageMetadata;

// Generic A2S is a protocol fallback, not a game.
const CREDITED_GAMES = PLAYGROUND_GAMES.filter((game) => game.id !== "a2s");

export function CreditsPage(): ReactNode {
  return (
    <DocsLayout {...metadata}>
      <h2 id="created-by">Created by</h2>
      <p>
        QueryHost is designed, built, and run by{" "}
        <a href="https://clutchy.me">Clutch</a>.
      </p>
      <h2 id="games">Games</h2>
      <p>
        QueryHost exists because of the games below and the developers and
        communities who build them and keep their servers running.
      </p>
      <ul className="credits-games">
        {CREDITED_GAMES.map((game) => (
          <li key={game.id}>
            <a href={`${documentationHref("/games/")}#${gameAnchor(game.id)}`}>
              {game.name}
            </a>
          </li>
        ))}
      </ul>
      <p>
        Game names are trademarks of their respective owners. QueryHost is an
        independent project and is not affiliated with or endorsed by any game
        developer or publisher.
      </p>
    </DocsLayout>
  );
}
