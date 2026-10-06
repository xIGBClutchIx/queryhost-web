import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function read(name: string): string {
  return readFileSync(
    new URL(`../src/styles/${name}.css`, import.meta.url),
    "utf8",
  );
}

const base = read("base");
const docs = read("docs");
const playground = read("playground");
const policy = read("policy");
// Token definitions live in base.css's first :root block; everything else must use them.
const rules = [
  base.slice(base.indexOf("\n}\n")),
  docs,
  playground,
  policy,
].join("\n");

/** Class names a stylesheet styles, so each page's rules stay in its own file. */
function classes(stylesheet: string): string[] {
  const selectors = stylesheet.replace(/\{[^{}]*\}/g, "{}");
  return [...selectors.matchAll(/\.([a-z][\w-]*)/g)].map(
    (match) => match[1] ?? "",
  );
}

function declarations(property: string): string[] {
  const pattern = new RegExp(`\\n\\s*${property}:\\s*([^;]+);`, "g");
  return [...rules.matchAll(pattern)].map((match) => match[1] ?? "");
}

describe("stylesheet tokens", () => {
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

describe("stylesheet layout", () => {
  it("keeps the capability table's hidden labels inside its scroll container", () => {
    const rule = /\.capability-table-scroll \{([^}]*)\}/.exec(docs)?.[1];
    expect(rule).toContain("position: relative;");
    expect(rule).toContain("overflow-x: auto;");
  });

  it("keeps the capability table a table on phones so its game column stays sticky", () => {
    const phone = docs.slice(docs.indexOf("@media (max-width: 34rem)"));
    const rule = /\n  \.capability-table \{([^}]*)\}/.exec(phone)?.[1];
    expect(rule).toContain("display: table;");
  });
});

describe("page stylesheets", () => {
  it("keep docs, playground, and policy rules out of the shared base", () => {
    expect(
      classes(base).filter((name) =>
        /^(query|custom-select|playground|docs|doc-|capability|policy)/.test(
          name,
        ),
      ),
    ).toEqual([]);
  });

  it("keep each page's rules in its own file", () => {
    expect(
      classes(docs).filter((name) =>
        /^(query|custom-select|policy)/.test(name),
      ),
    ).toEqual([]);
    expect(
      classes(playground).filter((name) =>
        /^(docs|doc-|capability|policy)/.test(name),
      ),
    ).toEqual([]);
  });
});
