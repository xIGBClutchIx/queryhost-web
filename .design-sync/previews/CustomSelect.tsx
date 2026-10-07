import { useState } from "react";
import type { ReactNode } from "react";
import { CustomSelect } from "@queryhost/web";

// QueryHost is dark-only; the preview card body is white, so each story sits on the page surface.
function Page({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <div
      className="query-form"
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        borderRadius: 8,
        minHeight: 240,
      }}
    >
      {children}
    </div>
  );
}

const GAMES = [
  { label: "Minecraft: Java Edition", value: "minecraft-java" },
  { label: "Rust", value: "rust" },
  { label: "Valheim", value: "valheim" },
  { label: "Palworld", value: "palworld" },
  { label: "Counter-Strike 2", value: "counter-strike-2" },
] as const;

type GameValue = (typeof GAMES)[number]["value"];

export function GamePicker(): ReactNode {
  const [value, setValue] = useState<GameValue>("rust");
  return (
    <Page>
      <CustomSelect
        id="preview-game"
        name="game"
        label="Game"
        options={GAMES}
        value={value}
        required
        onChange={setValue}
      />
    </Page>
  );
}

export function WithHelp(): ReactNode {
  const [value, setValue] = useState<"full" | "summary">("full");
  return (
    <Page>
      <CustomSelect
        id="preview-mode"
        name="mode"
        label="Mode"
        options={[
          { label: "Full details", value: "full" },
          { label: "Summary only", value: "summary" },
        ]}
        value={value}
        help="Full mode requests optional sources."
        onChange={setValue}
      />
    </Page>
  );
}

/** The menu opens on click; this story opens it on mount to show the listbox. */
export function Open(): ReactNode {
  const [value, setValue] = useState<GameValue>("valheim");
  return (
    <Page>
      <div
        ref={(element) => {
          element
            ?.querySelector<HTMLButtonElement>(".custom-select__trigger")
            ?.click();
        }}
      >
        <CustomSelect
          id="preview-open"
          name="game"
          label="Game"
          options={GAMES}
          value={value}
          onChange={setValue}
        />
      </div>
    </Page>
  );
}
