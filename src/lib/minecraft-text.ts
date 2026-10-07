/**
 * Display-only parsing of Minecraft `§` formatting codes. Query results keep the raw
 * text; these helpers only decide how the site shows it.
 */

/** Which code table applies: Bedrock reuses `m` and `n` for colors and adds more. */
export type MinecraftEdition = "java" | "bedrock";

/** One run of text sharing a single formatting state. */
export interface MinecraftTextSegment {
  readonly text: string;
  /** Display color, already lifted for contrast on the site's dark surfaces. */
  readonly color?: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underlined: boolean;
  readonly strikethrough: boolean;
  readonly obfuscated: boolean;
}

const SHARED_COLORS: Readonly<Record<string, string>> = {
  "0": "#000000",
  "1": "#0000aa",
  "2": "#00aa00",
  "3": "#00aaaa",
  "4": "#aa0000",
  "5": "#aa00aa",
  "6": "#ffaa00",
  "7": "#aaaaaa",
  "8": "#555555",
  "9": "#5555ff",
  a: "#55ff55",
  b: "#55ffff",
  c: "#ff5555",
  d: "#ff55ff",
  e: "#ffff55",
  f: "#ffffff",
};

// Bedrock-only colors (values as of Bedrock 26.50); `m` and `n` are colors there,
// not strike/underline.
const BEDROCK_COLORS: Readonly<Record<string, string>> = {
  ...SHARED_COLORS,
  g: "#efce16",
  h: "#d9ccb8",
  i: "#a9b4b7",
  j: "#8f727d",
  m: "#ee222c",
  n: "#c87363",
  p: "#ffbf1e",
  q: "#13a045",
  s: "#5fecff",
  t: "#577bff",
  u: "#b66cdd",
  v: "#ff6a00",
  w: "#8bb3ff",
};

type FormatState = Omit<MinecraftTextSegment, "text">;

const PLAIN_STATE: FormatState = {
  bold: false,
  italic: false,
  underlined: false,
  strikethrough: false,
  obfuscated: false,
};

// The darkest surface a result renders on (`--background`); colors must stay readable on it.
const SURFACE = "#0b1215";
const MIN_CONTRAST = 4.5;

function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((offset) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16),
  );
}

function luminance(hex: string): number {
  const [red = 0, green = 0, blue = 0] = channels(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.039_28
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(left: string, right: string): number {
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function mixWithWhite(hex: string, amount: number): string {
  return `#${channels(hex)
    .map((value) =>
      Math.round(value + (255 - value) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/**
 * Lifts a Minecraft color toward white just until it meets WCAG AA contrast on the
 * site's dark surface, so `§0` black or `§1` dark blue stay legible and keep their hue.
 */
export function readableMinecraftColor(hex: string): string {
  const normalized = hex.toLowerCase();
  for (let step = 0; step <= 20; step += 1) {
    const candidate = mixWithWhite(normalized, step / 20);
    if (contrast(candidate, SURFACE) >= MIN_CONTRAST) return candidate;
  }
  return "#ffffff";
}

function javaHexColor(
  text: string,
  offset: number,
): { readonly color: string; readonly end: number } | undefined {
  // Spigot/BungeeCord hex form: §x§R§R§G§G§B§B, with `offset` at the `x`.
  let hex = "";
  let cursor = offset + 1;
  for (let index = 0; index < 6; index += 1) {
    const digit = text[cursor + 1];
    if (
      text[cursor] !== "§" ||
      digit === undefined ||
      !/^[0-9a-f]$/iu.test(digit)
    ) {
      return undefined;
    }
    hex += digit;
    cursor += 2;
  }
  return { color: `#${hex.toLowerCase()}`, end: cursor };
}

function sameState(left: FormatState, right: FormatState): boolean {
  return (
    left.color === right.color &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underlined === right.underlined &&
    left.strikethrough === right.strikethrough &&
    left.obfuscated === right.obfuscated
  );
}

/**
 * Splits text into formatted runs, consuming every recognized `§` code. Unknown codes
 * and a trailing lone `§` stay visible as text, matching how the game treats them.
 */
export function minecraftTextSegments(
  text: string,
  edition: MinecraftEdition,
): readonly MinecraftTextSegment[] {
  const colors = edition === "bedrock" ? BEDROCK_COLORS : SHARED_COLORS;
  const segments: MinecraftTextSegment[] = [];
  let state = PLAIN_STATE;
  let pending = "";

  const flush = (): void => {
    if (pending.length === 0) return;
    const previous = segments.at(-1);
    if (previous !== undefined && sameState(previous, state)) {
      segments[segments.length - 1] = {
        ...previous,
        text: previous.text + pending,
      };
    } else {
      segments.push({ ...state, text: pending });
    }
    pending = "";
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text.charAt(index);
    const code = text.charAt(index + 1).toLowerCase();
    if (character !== "§" || code === "") {
      pending += character;
      continue;
    }

    const hex =
      edition === "java" && code === "x"
        ? javaHexColor(text, index + 1)
        : undefined;
    const color = hex?.color ?? colors[code];
    if (color !== undefined) {
      flush();
      // Java resets styles on a color code; Bedrock keeps them until `§r`.
      state = {
        ...(edition === "java" ? PLAIN_STATE : state),
        color: readableMinecraftColor(color),
      };
      index = hex === undefined ? index + 1 : hex.end - 1;
    } else if (code === "r") {
      flush();
      state = PLAIN_STATE;
      index += 1;
    } else if (code === "k" || code === "l" || code === "o") {
      flush();
      state = {
        ...state,
        ...(code === "k" ? { obfuscated: true } : {}),
        ...(code === "l" ? { bold: true } : {}),
        ...(code === "o" ? { italic: true } : {}),
      };
      index += 1;
    } else if (edition === "java" && (code === "m" || code === "n")) {
      flush();
      state = {
        ...state,
        ...(code === "m" ? { strikethrough: true } : { underlined: true }),
      };
      index += 1;
    } else {
      pending += character;
    }
  }
  flush();
  return segments;
}

/** Text with every recognized formatting code removed. */
export function stripMinecraftFormatting(
  text: string,
  edition: MinecraftEdition,
): string {
  return minecraftTextSegments(text, edition)
    .map((segment) => segment.text)
    .join("");
}

/** Code table for a game id, or `undefined` for games that never use `§` codes. */
export function minecraftEdition(game: string): MinecraftEdition | undefined {
  if (game === "minecraft-java") return "java";
  if (game === "minecraft-bedrock") return "bedrock";
  return undefined;
}
