import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { OutputState } from "./use-playground-session.js";

/** Output this close to its framed position is left alone instead of nudged. */
const FRAMED_SLACK_PX = 48;

/**
 * Scrolls a finished result or request error up to its framed position: just
 * below the sticky header on phones, and below the sticky form on wider screens.
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
    // `scroll-margin-top` is where the stylesheet frames the output, so the check
    // and the scroll share one source for the sticky chrome's height.
    const framedTop = Number.parseFloat(
      getComputedStyle(target).scrollMarginTop,
    );
    // A short result is still framed: the page scrolls only as far as it can, so
    // the result keeps breathing room above the bottom edge.
    const { top } = target.getBoundingClientRect();
    if (top - (Number.isFinite(framedTop) ? framedTop : 0) <= FRAMED_SLACK_PX) {
      return;
    }
    // The default behavior follows the page's CSS: smooth, or instant when the
    // person prefers reduced motion.
    target.scrollIntoView({ block: "start" });
  }, [output]);

  return outputRef;
}
