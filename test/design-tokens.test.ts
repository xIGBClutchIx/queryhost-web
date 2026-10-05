import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);
// Token definitions live in the first :root block; everything after must use them.
const rules = stylesheet.slice(stylesheet.indexOf("\n}\n"));

function declarations(property: string): string[] {
  const pattern = new RegExp(`\\n\\s*${property}:\\s*([^;]+);`, "g");
  return [...rules.matchAll(pattern)].map((match) => match[1] ?? "");
}

describe("global stylesheet tokens", () => {
  it("uses the type scale for fixed font sizes and weights", () => {
    const sizes = declarations("font-size").filter(
      (value) => !value.startsWith("var(--text-"),
    );
    // Fluid display headings, em-relative code, and inherit stay literal.
    expect(
      sizes.every((value) => /^(clamp\(|[\d.]+em$|inherit$)/.test(value)),
    ).toBe(true);
    expect(
      declarations("font-weight").filter(
        (value) => !value.startsWith("var(--weight-"),
      ),
    ).toEqual([]);
  });

  it("uses radius and duration tokens", () => {
    for (const value of declarations("border-radius")) {
      expect(value).not.toMatch(/\d(rem|px)/);
    }
    expect(rules).not.toMatch(/(?<![\d.])[1-9]\d{2}ms/);
  });
});
