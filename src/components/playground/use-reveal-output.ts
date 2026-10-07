import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { OutputState } from "./use-playground-session.js";

/** Phones put the output top near 75% of the viewport; laptops and up near 60%. */
const REVEAL_THRESHOLD = 0.65;

/**
 * Scrolls a finished result or request error into view when most of it would
 * otherwise sit below the fold, as on phones where the form fills the screen.
 * Focus stays where it was; the output region's live announcement reports the
 * outcome.
 */
export function useRevealOutput(
  output: OutputState,
): RefObject<HTMLElement | null> {
  const outputRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (output.kind !== "result" && output.kind !== "error") return;
    const target = outputRef.current;
    if (target === null) return;
    // Only reveal output that starts in the lower third of the viewport and runs
    // past its bottom; output already in reading position is left alone.
    const { bottom, top } = target.getBoundingClientRect();
    const viewport = window.innerHeight;
    if (top < viewport * REVEAL_THRESHOLD || bottom <= viewport) return;
    // The default behavior follows the page's CSS: smooth, or instant when the
    // person prefers reduced motion. `scroll-margin-top` clears the sticky chrome.
    target.scrollIntoView({ block: "start" });
  }, [output]);

  return outputRef;
}
