import { useEffect, useState } from "react";
import type { RefObject } from "react";

/**
 * Whether a sticky bar has pinned below the block above it: true once that block
 * has scrolled up past the bar's sticky offset. The bar's own height never
 * changes with this state, so toggling it cannot move the page and oscillate.
 * Where the stylesheet does not make the bar sticky, it is never stuck.
 */
export function useStuck(
  aboveRef: RefObject<HTMLElement>,
  barRef: RefObject<HTMLElement>,
): boolean {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    let frame = 0;
    function measure(): void {
      frame = 0;
      const above = aboveRef.current;
      const bar = barRef.current;
      if (above === null || bar === null) return;
      const style = getComputedStyle(bar);
      const top = Number.parseFloat(style.top);
      setStuck(
        style.position === "sticky" &&
          Number.isFinite(top) &&
          above.getBoundingClientRect().bottom <= top + 1,
      );
    }
    function schedule(): void {
      if (frame === 0) frame = requestAnimationFrame(measure);
    }
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [aboveRef, barRef]);

  return stuck;
}
