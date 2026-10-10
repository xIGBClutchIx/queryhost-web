import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

type ShareState = "copied" | "failed" | "idle";

const LABELS: Readonly<Record<ShareState, string>> = {
  copied: "Link copied",
  failed: "Copy failed",
  idle: "Copy link to this result",
};

/** A quiet link icon beside the result name that copies its shareable URL. */
export function ShareLinkButton({ url }: { readonly url: string }): ReactNode {
  const [state, setState] = useState<ShareState>("idle");
  const resetTimer = useRef<number | undefined>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);

  function settle(next: ShareState): void {
    if (!mounted.current) return;
    setState(next);
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => {
      setState("idle");
    }, 1_500);
  }

  const label = LABELS[state];
  return (
    <button
      type="button"
      className="query-result__share"
      id="query-result-share"
      aria-label={label}
      title={label}
      data-state={state}
      onClick={() => {
        void navigator.clipboard.writeText(url).then(
          () => {
            settle("copied");
          },
          () => {
            settle("failed");
          },
        );
      }}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {state === "copied" ? (
          <path d="m5 12.5 4.5 4.5L19 7.5" />
        ) : (
          <>
            <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
            <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
          </>
        )}
      </svg>
      <span className="sr-only" aria-live="polite">
        {state === "idle" ? "" : label}
      </span>
    </button>
  );
}
