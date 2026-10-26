import type { JsonObject, JsonValue } from "./playground-contracts.js";
import {
  minecraftEdition,
  minecraftTextSegments,
  readableMinecraftColor,
  type MinecraftTextSegment,
} from "./minecraft-text.js";

/** Only bounded embedded PNGs can become images; never fetch a server-supplied URL. */
export function minecraftIcon(
  value: JsonValue | undefined,
): string | undefined {
  if (
    typeof value !== "string" ||
    value.length > 100_000 ||
    !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(value)
  )
    return undefined;
  try {
    const header = atob(value.slice("data:image/png;base64,".length));
    if (
      header.length < 24 ||
      header.slice(0, 8) !== "\x89PNG\r\n\x1a\n" ||
      header.slice(12, 16) !== "IHDR"
    )
      return undefined;
    const size = (offset: number) =>
      Array.from(header.slice(offset, offset + 4)).reduce(
        (total, byte) => total * 256 + byte.charCodeAt(0),
        0,
      );
    return size(16) === 64 && size(20) === 64 ? value : undefined;
  } catch {
    return undefined;
  }
}

/** Reuse the site's edition-aware formatter without interpreting text as markup. */
export function appendMinecraftText(
  node: HTMLElement,
  value: string,
  game: string,
): void {
  const edition = minecraftEdition(game);
  if (edition === undefined) {
    node.textContent = value;
    return;
  }
  for (const segment of minecraftTextSegments(value, edition)) {
    const span = node.ownerDocument.createElement("span");
    span.textContent = segment.text;
    if (segment.color) span.style.color = segment.color;
    if (segment.bold) span.style.fontWeight = "bold";
    if (segment.italic) span.style.fontStyle = "italic";
    span.style.textDecoration = [
      segment.underlined && "underline",
      segment.strikethrough && "line-through",
    ]
      .filter(Boolean)
      .join(" ");
    if (segment.obfuscated) span.style.filter = "blur(0.18em)";
    node.append(span);
  }
}

/** Rebuild only the query library's fixed span/br vocabulary, discarding all attributes. */
function appendMotdHtml(node: HTMLElement, html: string): boolean {
  if (html.length > 65_536) return false;
  const template = node.ownerDocument.createElement("template");
  template.innerHTML = html;
  const fragment = node.ownerDocument.createDocumentFragment();
  let count = 0;
  const copy = (source: Node, target: Node, depth: number): boolean => {
    if (++count > 2048 || depth > 16) return false;
    if (source.nodeType === 3) {
      target.appendChild(
        node.ownerDocument.createTextNode(source.textContent ?? ""),
      );
      return true;
    }
    if (!(source instanceof node.ownerDocument.defaultView!.HTMLElement))
      return false;
    if (source.tagName !== "SPAN" && source.tagName !== "BR") return false;
    const clean = node.ownerDocument.createElement(
      source.tagName.toLowerCase(),
    );
    if (source.tagName === "SPAN") {
      const declarations = (source.getAttribute("style") ?? "").split(";");
      for (const declaration of declarations) {
        if (declaration === "") continue;
        const [property, value] = declaration
          .split(":")
          .map((part) => part.trim());
        if (property === "color" && /^#[0-9a-f]{6}$/iu.test(value ?? ""))
          clean.style.color = readableMinecraftColor(value ?? "#ffffff");
        else if (property === "font-weight" && value === "bold")
          clean.style.fontWeight = value;
        else if (property === "font-style" && value === "italic")
          clean.style.fontStyle = value;
        else if (
          property === "text-decoration" &&
          /^(?:underline|line-through|underline line-through)$/u.test(
            value ?? "",
          )
        )
          clean.style.textDecoration = value ?? "";
        else if (property === "filter" && value === "blur(0.25em)")
          clean.style.filter = "blur(0.18em)";
        else return false;
      }
    }
    for (const child of source.childNodes)
      if (!copy(child, clean, depth + 1)) return false;
    target.appendChild(clean);
    return true;
  };
  for (const child of template.content.childNodes)
    if (!copy(child, fragment, 0)) return false;
  node.append(fragment);
  return true;
}

type SegmentStyle = Omit<MinecraftTextSegment, "text">;

const PLAIN_STYLE: SegmentStyle = {
  bold: false,
  italic: false,
  obfuscated: false,
  strikethrough: false,
  underlined: false,
};

/**
 * Reads the query library's fixed span/br MOTD vocabulary into formatted runs, with
 * colors lifted for contrast. Returns `undefined` for anything outside that vocabulary,
 * so callers fall back to the plain MOTD instead of trusting unexpected markup.
 */
export function motdHtmlSegments(
  doc: Document,
  html: string,
): readonly MinecraftTextSegment[] | undefined {
  if (html.length > 65_536) return undefined;
  const template = doc.createElement("template");
  template.innerHTML = html;
  const segments: MinecraftTextSegment[] = [];
  let count = 0;
  const visit = (source: Node, style: SegmentStyle, depth: number): boolean => {
    if (++count > 2048 || depth > 16) return false;
    if (source.nodeType === 3) {
      const text = source.textContent ?? "";
      if (text.length > 0) segments.push({ ...style, text });
      return true;
    }
    if (source.nodeType !== 1) return false;
    const element = source as Element;
    if (element.tagName === "BR") {
      segments.push({ ...style, text: "\n" });
      return element.childNodes.length === 0;
    }
    if (element.tagName !== "SPAN") return false;
    let next = style;
    for (const declaration of (element.getAttribute("style") ?? "").split(
      ";",
    )) {
      if (declaration.trim() === "") continue;
      const [property, value = ""] = declaration
        .split(":")
        .map((part) => part.trim());
      if (property === "color" && /^#[0-9a-f]{6}$/iu.test(value))
        next = { ...next, color: readableMinecraftColor(value) };
      else if (property === "font-weight" && value === "bold")
        next = { ...next, bold: true };
      else if (property === "font-style" && value === "italic")
        next = { ...next, italic: true };
      else if (
        property === "text-decoration" &&
        /^(?:underline|line-through|underline line-through)$/u.test(value)
      )
        next = {
          ...next,
          strikethrough: value.includes("line-through"),
          underlined: value.includes("underline"),
        };
      else if (property === "filter" && value === "blur(0.25em)")
        next = { ...next, obfuscated: true };
      else return false;
    }
    for (const child of element.childNodes)
      if (!visit(child, next, depth + 1)) return false;
    return true;
  };
  for (const child of template.content.childNodes)
    if (!visit(child, PLAIN_STYLE, 0)) return undefined;
  return segments;
}

/** Visual identity shared by MCP cards and the workspace. Missing fields stay absent. */
export function minecraftIdentity(
  doc: Document,
  game: string,
  data: JsonObject,
  server: JsonObject,
): HTMLElement | undefined {
  if (minecraftEdition(game) === undefined) return undefined;
  const block = doc.createElement("div");
  block.className = "minecraft-identity";
  const icon =
    game === "minecraft-java" ? minecraftIcon(data["favicon"]) : undefined;
  if (icon) {
    const image = doc.createElement("img");
    image.src = icon;
    image.alt = "Minecraft server icon";
    image.width = image.height = 64;
    image.addEventListener(
      "error",
      () => {
        image.remove();
      },
      { once: true },
    );
    block.append(image);
  }
  const motd = data["motd"] ?? server["motd"];
  const object =
    motd !== null && typeof motd === "object" && !Array.isArray(motd)
      ? motd
      : {};
  const plain = typeof motd === "string" ? motd : object["plain"];
  const html = object["html"];
  if (typeof plain === "string" || typeof html === "string") {
    const paragraph = doc.createElement("p");
    paragraph.className = "minecraft-motd";
    if (!(typeof html === "string" && appendMotdHtml(paragraph, html)))
      appendMinecraftText(
        paragraph,
        typeof plain === "string" ? plain : "",
        game,
      );
    block.append(paragraph);
  }
  return block.childElementCount > 0 ? block : undefined;
}
