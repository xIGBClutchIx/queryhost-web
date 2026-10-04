import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CustomSelect } from "@queryhost/web";

// The site paints its dark theme on <body>; previews reproduce that surface.
function Page({ children, height }: { children: ReactNode; height?: number }) {
  return (
    <div
      style={{
        background: "var(--background)",
        color: "var(--text)",
        padding: 24,
        width: 360,
        minHeight: height,
      }}
    >
      {children}
    </div>
  );
}

const GAME_OPTIONS = [
  { label: "Counter-Strike 2", value: "counter-strike-2" },
  { label: "Minecraft: Java Edition", value: "minecraft-java" },
  { label: "Palworld", value: "palworld" },
  { label: "Rust", value: "rust" },
  { label: "Valheim", value: "valheim" },
];

const MODE_OPTIONS = [
  { label: "Full details", value: "full" },
  { label: "Summary only", value: "summary" },
];

const TIMEOUT_OPTIONS = [
  { label: "3 seconds", value: "3000" },
  { label: "5 seconds", value: "5000" },
];

export const GamePicker = () => {
  const [game, setGame] = useState("minecraft-java");
  return (
    <Page>
      <CustomSelect
        id="query-game"
        name="game"
        label="Game"
        options={GAME_OPTIONS}
        value={game}
        required
        onChange={setGame}
      />
    </Page>
  );
};

export const WithHelpText = () => {
  const [mode, setMode] = useState("full");
  const [timeoutMs, setTimeoutMs] = useState("5000");
  return (
    <Page>
      <div style={{ display: "grid", gap: 16 }}>
        <CustomSelect
          id="query-mode"
          name="mode"
          label="Mode"
          options={MODE_OPTIONS}
          value={mode}
          help="Full mode requests optional sources."
          onChange={setMode}
        />
        <CustomSelect
          id="query-timeout"
          name="timeoutMs"
          label="Deadline"
          options={TIMEOUT_OPTIONS}
          value={timeoutMs}
          help="One deadline for the entire query."
          onChange={setTimeoutMs}
        />
      </div>
    </Page>
  );
};

// The listbox opens only through interaction, so this story clicks the real trigger once.
export const Open = () => {
  const [game, setGame] = useState("rust");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current
      ?.querySelector<HTMLButtonElement>(".custom-select__trigger")
      ?.click();
  }, []);
  return (
    <Page height={340}>
      <div ref={ref}>
        <CustomSelect
          id="query-game-open"
          name="game"
          label="Game"
          options={GAME_OPTIONS}
          value={game}
          required
          onChange={setGame}
        />
      </div>
    </Page>
  );
};
