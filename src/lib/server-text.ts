import {
  minecraftEdition,
  stripMinecraftFormatting,
} from "./minecraft-text.js";

/** Cfx.re (FiveM and RedM) `^0`–`^9` color codes. */
const CFX_COLOR_CODES = /\^\d/gu;

/** Bidirectional controls that could reorder the surrounding page text. */
const BIDI_CONTROLS = /[؜‎‏‪-‮⁦-⁩]/gu;

/**
 * Server-reported text, such as a name or version, as the site shows it: game
 * formatting codes and bidirectional controls removed. Query results and JSON
 * keep the raw value.
 */
export function displayServerText(game: string, text: string): string {
  const edition = minecraftEdition(game);
  const plain =
    edition !== undefined
      ? stripMinecraftFormatting(text, edition)
      : game === "fivem" || game === "redm"
        ? text.replaceAll(CFX_COLOR_CODES, "")
        : text;
  return plain.replaceAll(BIDI_CONTROLS, "");
}
