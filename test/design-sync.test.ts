import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// The Claude Design sync reads hand-maintained copies of the components; these
// checks fail when a copy drifts from its source (see .design-sync/NOTES.md).

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const config = z
  .object({
    dtsPropsFor: z.record(z.string(), z.string()),
    componentSrcMap: z.record(z.string(), z.string().nullable()),
  })
  .parse(JSON.parse(read(".design-sync/config.json")));

/**
 * Exported components the sync deliberately leaves out: internal pieces that
 * only render inside a synced component.
 */
const INTERNAL_COMPONENTS = new Set([
  "CopyButton",
  "DataPanel",
  "DocsPager",
  "JsonPanel",
  "MinecraftText",
  "OverviewPanel",
  "PlaygroundExamples",
  "QueryForm",
  "SourcesPanel",
]);

interface Prop {
  readonly name: string;
  readonly optional: boolean;
}

interface ComponentSource {
  readonly path: string;
  readonly props: readonly Prop[];
}

function componentFiles(directory: string): string[] {
  return readdirSync(new URL(`../${directory}`, import.meta.url), {
    withFileTypes: true,
  }).flatMap((entry) =>
    entry.isDirectory()
      ? componentFiles(`${directory}/${entry.name}`)
      : entry.name.endsWith(".tsx")
        ? [`${directory}/${entry.name}`]
        : [],
  );
}

function isExported(node: ts.Node): boolean {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/** Exported PascalCase function components and the props parameter of each. */
function componentFunctions(
  file: ts.SourceFile,
): Array<[string, ts.ParameterDeclaration | undefined]> {
  return file.statements.flatMap(
    (statement): Array<[string, ts.ParameterDeclaration | undefined]> => {
      if (!isExported(statement)) return [];
      if (ts.isFunctionDeclaration(statement) && statement.name) {
        return [[statement.name.text, statement.parameters[0]]];
      }
      if (!ts.isVariableStatement(statement)) return [];
      return statement.declarationList.declarations.flatMap(
        (declaration): Array<[string, ts.ParameterDeclaration | undefined]> => {
          // `export const X = memo(function X(props: XProps) {...})`
          const initializer = declaration.initializer;
          const inner =
            initializer && ts.isCallExpression(initializer)
              ? initializer.arguments[0]
              : initializer;
          return ts.isIdentifier(declaration.name) &&
            inner &&
            (ts.isFunctionExpression(inner) || ts.isArrowFunction(inner))
            ? [[declaration.name.text, inner.parameters[0]]]
            : [];
        },
      );
    },
  );
}

/** Every exported component in src/components, with its resolved props. */
function exportedComponents(): Map<string, ComponentSource> {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tsconfig = ts.parseJsonSourceFileConfigFileContent(
    ts.readJsonConfigFile(join(root, "tsconfig.json"), (path) =>
      ts.sys.readFile(path),
    ),
    ts.sys,
    root,
  );
  const paths = componentFiles("src/components");
  const program = ts.createProgram(
    paths.map((path) => join(root, path)),
    { ...tsconfig.options, noEmit: true },
  );
  const checker = program.getTypeChecker();
  const components = new Map<string, ComponentSource>();
  for (const path of paths) {
    const file = program.getSourceFile(join(root, path));
    if (file === undefined) throw new Error(`Missing ${path}`);
    for (const [name, parameter] of componentFunctions(file)) {
      if (!/^[A-Z]/.test(name)) continue;
      const props =
        parameter === undefined
          ? []
          : checker
              .getPropertiesOfType(checker.getTypeAtLocation(parameter))
              .map((symbol) => ({
                name: symbol.name,
                optional: (symbol.flags & ts.SymbolFlags.Optional) !== 0,
              }));
      components.set(name, { path, props });
    }
  }
  return components;
}

/** Component exports in entry.ts, mapped to the source file they come from. */
function entryExports(): Map<string, string> {
  const exports = new Map<string, string>();
  const entry = read(".design-sync/entry.ts");
  for (const match of entry.matchAll(
    /export \{([^}]+)\} from "\.\.\/(src\/components\/[^"]+)\.js";/g,
  )) {
    for (const name of (match[1] ?? "").split(",")) {
      if (name.trim() !== "") {
        exports.set(name.trim(), `${match[2] ?? ""}.tsx`);
      }
    }
  }
  return exports;
}

/** Top-level prop names in a dtsPropsFor entry (two-space indented members). */
function documentedProps(source: string): Prop[] {
  return [...source.matchAll(/^ {2}(\w+)(\??):/gm)].map((match) => ({
    name: match[1] ?? "",
    optional: match[2] === "?",
  }));
}

function byName(props: readonly Prop[]): Prop[] {
  return props.toSorted((left, right) => left.name.localeCompare(right.name));
}

const components = exportedComponents();
const synced = Object.entries(config.componentSrcMap).flatMap(([name, path]) =>
  path === null ? [] : [{ name, path }],
);

describe("design-sync component list", () => {
  it("classifies every exported component as synced, excluded, or internal", () => {
    const unclassified = [...components.keys()].filter(
      (name) =>
        !(name in config.componentSrcMap) && !INTERNAL_COMPONENTS.has(name),
    );
    expect(unclassified).toEqual([]);
    expect(
      [...INTERNAL_COMPONENTS].filter((name) => !components.has(name)),
    ).toEqual([]);
  });

  it("exports each synced component from entry.ts at its mapped source", () => {
    const fromEntry = entryExports();
    expect(
      Object.fromEntries(
        [...fromEntry].toSorted(([left], [right]) => left.localeCompare(right)),
      ),
    ).toEqual(
      Object.fromEntries(
        synced
          .map(({ name, path }) => [name, path] as const)
          .toSorted(([left], [right]) => left.localeCompare(right)),
      ),
    );
    for (const { name, path } of synced) {
      expect(components.get(name)?.path, name).toBe(path);
    }
  });
});

describe("design-sync props", () => {
  it.each(synced)("documents $name's props in dtsPropsFor", ({ name }) => {
    const documented = config.dtsPropsFor[name];
    expect(documented, `${name} needs a dtsPropsFor entry`).toBeDefined();
    expect(byName(documentedProps(documented ?? ""))).toEqual(
      byName(components.get(name)?.props ?? []),
    );
  });

  it("has no dtsPropsFor entry for an unsynced component", () => {
    const names = new Set(synced.map(({ name }) => name));
    expect(
      Object.keys(config.dtsPropsFor).filter((name) => !names.has(name)),
    ).toEqual([]);
  });
});

describe("design-sync brand assets", () => {
  it("inlines the current public/favicon.svg", () => {
    const encoded = /url\("data:image\/svg\+xml,([^"]+)"\)/.exec(
      read(".design-sync/brand-assets.css"),
    )?.[1];
    const normalize = (svg: string): string =>
      svg
        .replaceAll("'", '"')
        .replaceAll(/\s*\/>/g, "/>")
        .replaceAll(/>\s+</g, "><")
        .trim();
    expect(encoded).toBeDefined();
    expect(normalize(decodeURIComponent(encoded ?? ""))).toBe(
      normalize(read("public/favicon.svg")),
    );
  });
});
