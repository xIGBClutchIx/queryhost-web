import { describe, expect, it } from "vitest";

import {
  minecraftEdition,
  minecraftTextSegments,
  readableMinecraftColor,
  stripMinecraftFormatting,
} from "../src/lib/minecraft-text.js";

describe("Minecraft formatting codes", () => {
  it("strips the repeated codes CubeCraft sends in its Bedrock name", () => {
    expect(
      stripMinecraftFormatting(
        "§f§f§f§f§fHALLOWEEN EVENT, HUNT + MAPS",
        "bedrock",
      ),
    ).toBe("HALLOWEEN EVENT, HUNT + MAPS");
  });

  it("splits colors and styles, and a color code resets styles", () => {
    expect(minecraftTextSegments("§l§eGold §bAqua§r plain", "java")).toEqual([
      {
        text: "Gold ",
        color: "#ffff55",
        bold: false,
        italic: false,
        underlined: false,
        strikethrough: false,
        obfuscated: false,
      },
      {
        text: "Aqua",
        color: "#55ffff",
        bold: false,
        italic: false,
        underlined: false,
        strikethrough: false,
        obfuscated: false,
      },
      {
        text: " plain",
        bold: false,
        italic: false,
        underlined: false,
        strikethrough: false,
        obfuscated: false,
      },
    ]);
    expect(minecraftTextSegments("§c§lBold red", "bedrock")[0]).toMatchObject({
      text: "Bold red",
      color: "#ff5555",
      bold: true,
    });
  });

  it("keeps Bedrock styles across color codes until §r", () => {
    const [bold, red, plain] = minecraftTextSegments(
      "§lBold §cRed§r plain",
      "bedrock",
    );
    expect(bold).toMatchObject({ text: "Bold ", bold: true });
    expect(red).toMatchObject({ text: "Red", bold: true, color: "#ff5555" });
    expect(plain).toMatchObject({ text: " plain", bold: false });
    expect(minecraftTextSegments("§lBold §cRed", "java")[1]).toMatchObject({
      bold: false,
    });
  });

  it("reads m and n per edition", () => {
    expect(minecraftTextSegments("§mstruck", "java")[0]).toMatchObject({
      strikethrough: true,
    });
    expect(minecraftTextSegments("§nunder", "java")[0]).toMatchObject({
      underlined: true,
    });
    expect(minecraftTextSegments("§mredstone", "bedrock")[0]).toMatchObject({
      color: readableMinecraftColor("#ee222c"),
      strikethrough: false,
    });
    expect(stripMinecraftFormatting("§gcoin §vresin §wparty", "bedrock")).toBe(
      "coin resin party",
    );
  });

  it("decodes Java hex colors and leaves unknown or dangling codes visible", () => {
    expect(minecraftTextSegments("§x§1§2§a§b§c§dHex", "java")[0]).toMatchObject(
      { text: "Hex", color: readableMinecraftColor("#12abcd") },
    );
    expect(stripMinecraftFormatting("§x§1§2Hex", "bedrock")).toBe("§xHex");
    expect(stripMinecraftFormatting("100§ §zok§", "java")).toBe("100§ §zok§");
  });

  it("lifts dark colors to readable contrast and keeps bright ones exact", () => {
    expect(readableMinecraftColor("#55ffff")).toBe("#55ffff");
    expect(readableMinecraftColor("#FFFFFF")).toBe("#ffffff");
    const black = readableMinecraftColor("#000000");
    const darkBlue = readableMinecraftColor("#0000aa");
    expect(black).not.toBe("#000000");
    expect(darkBlue).not.toBe("#0000aa");
    // Dark blue stays bluer than it is red or green after lifting.
    const [red, green, blue] = [1, 3, 5].map((offset) =>
      Number.parseInt(darkBlue.slice(offset, offset + 2), 16),
    );
    expect(blue).toBeGreaterThan(red ?? 0);
    expect(blue).toBeGreaterThan(green ?? 0);
  });

  it("keeps every lifted color at 4.5:1 on the glass card and lighter surfaces", () => {
    const luminance = (hex: string): number => {
      const [red = 0, green = 0, blue = 0] = [1, 3, 5].map((offset) => {
        const channel =
          Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return channel <= 0.039_28
          ? channel / 12.92
          : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const codes = "0123456789abcdefghijmnpqstuvw";
    for (const surface of ["#0f181c", "#172429"]) {
      for (const code of codes) {
        const [segment] = minecraftTextSegments(`§${code}x`, "bedrock");
        const color = segment?.color ?? "#000000";
        const ratio = (luminance(color) + 0.05) / (luminance(surface) + 0.05);
        expect(ratio, `§${code} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("applies only to Minecraft games", () => {
    expect(minecraftEdition("minecraft-java")).toBe("java");
    expect(minecraftEdition("minecraft-bedrock")).toBe("bedrock");
    expect(minecraftEdition("rust")).toBeUndefined();
  });
});
