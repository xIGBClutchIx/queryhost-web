import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** How long the outcome replaces the button's label. */
const RESET_MS = 1_500;

/** Writes to the clipboard; insecure origins have no clipboard API at all. */
function writeClipboard(text: string): Promise<void> {
  try {
    const { clipboard } = navigator as Partial<Navigator>;
    if (clipboard === undefined) {
      return Promise.reject(new Error("The clipboard is unavailable."));
    }
    return clipboard.writeText(text);
  } catch (error) {
    return Promise.reject(
      error instanceof Error ? error : new Error("The copy failed."),
    );
  }
}

/**
 * Copies text to the clipboard and briefly confirms the outcome in its label,
 * which a live region also announces.
 */
export function CopyButton({
  label: idleLabel,
  text,
}: {
  readonly label: string;
  readonly text: string;
}): ReactNode {
  const [outcome, setOutcome] = useState<string | undefined>(undefined);
  const resetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  function show(next: string): void {
    if (!mounted.current) return;
    setOutcome(next);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setOutcome(undefined);
    }, RESET_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void writeClipboard(text).then(
            () => {
              show("Copied");
            },
            () => {
              show("Copy failed");
            },
          );
        }}
      >
        {outcome ?? idleLabel}
      </button>
      <span className="sr-only" role="status">
        {outcome}
      </span>
    </>
  );
}
