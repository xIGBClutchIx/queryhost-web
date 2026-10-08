import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/** Copies text to the clipboard and briefly confirms the outcome in its label. */
export function CopyButton({
  label: idleLabel,
  text,
}: {
  readonly label: string;
  readonly text: string;
}): ReactNode {
  const [label, setLabel] = useState(idleLabel);
  const resetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(
          () => {
            if (!mounted.current) return;
            setLabel("Copied");
            window.clearTimeout(resetTimer.current);
            resetTimer.current = window.setTimeout(() => {
              setLabel(idleLabel);
            }, 1_500);
          },
          () => {
            if (mounted.current) setLabel("Copy failed");
          },
        );
      }}
    >
      {label}
    </button>
  );
}
