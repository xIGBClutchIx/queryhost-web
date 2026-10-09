import { useLayoutEffect } from "react";
import type { RefObject } from "react";

/**
 * Marks the playground with `data-fits` while its content fits inside the
 * playground's viewport-tall minimum height, so the stylesheet can drop the
 * bottom breathing room that would otherwise add a few pixels of scroll to a
 * page with nothing below the fold. Content that does overflow keeps the room.
 *
 * `layoutKey` re-runs the measurement when the set of children changes, since
 * a child appearing or leaving moves its siblings without resizing them.
 */
export function useViewportFit(
  playgroundRef: RefObject<HTMLElement>,
  layoutKey: string,
): void {
  useLayoutEffect(() => {
    const playground = playgroundRef.current;
    if (playground === null) return;
    function syncFit(): void {
      if (playground === null) return;
      const last = playground.lastElementChild;
      if (last === null) return;
      const style = getComputedStyle(playground);
      const minHeight = Number.parseFloat(style.minHeight);
      if (!Number.isFinite(minHeight)) return;
      // Measured from the content itself, not the padded box, so toggling the
      // padding never changes the answer and the attribute cannot oscillate.
      const contentHeight =
        last.getBoundingClientRect().bottom -
        playground.getBoundingClientRect().top +
        Number.parseFloat(getComputedStyle(last).marginBottom || "0");
      playground.toggleAttribute("data-fits", contentHeight <= minHeight);
    }
    // The playground resizes with the viewport; children resize as the form
    // and result change, which moves the content's bottom inside a fixed box.
    const observer = new ResizeObserver(syncFit);
    observer.observe(playground);
    for (const child of playground.children) observer.observe(child);
    syncFit();
    return () => {
      observer.disconnect();
    };
  }, [playgroundRef, layoutKey]);
}
