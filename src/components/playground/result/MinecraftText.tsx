import type { CSSProperties } from "preact";
import type { ReactNode } from "react";

import {
  minecraftTextSegments,
  type MinecraftEdition,
} from "../../../lib/minecraft-text.js";

interface MinecraftTextProps {
  readonly edition: MinecraftEdition;
  readonly text: string;
}

/** Renders `§`-formatted Minecraft text as styled spans; codes never reach the page. */
export function MinecraftText({
  edition,
  text,
}: MinecraftTextProps): ReactNode {
  return minecraftTextSegments(text, edition).map((segment, index) => {
    const className = [
      segment.bold && "mc-bold",
      segment.italic && "mc-italic",
      segment.underlined && "mc-underlined",
      segment.strikethrough && "mc-strikethrough",
      segment.obfuscated && "mc-obfuscated",
    ]
      .filter((name) => typeof name === "string")
      .join(" ");
    const style: CSSProperties | undefined =
      segment.color === undefined ? undefined : { color: segment.color };
    return className === "" && style === undefined ? (
      segment.text
    ) : (
      <span
        key={index}
        {...(className === "" ? {} : { className })}
        {...(style === undefined ? {} : { style })}
      >
        {segment.text}
      </span>
    );
  });
}
