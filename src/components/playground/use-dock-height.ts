import { useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

export interface DockHeightRefs {
  readonly dockRef: RefObject<HTMLDivElement>;
  readonly playgroundRef: RefObject<HTMLElement>;
}

/**
 * Publishes the form dock's height as `--query-dock-height` on the playground, so
 * the sticky result header sits below a dock whose height changes with layout.
 */
export function useDockHeight(): DockHeightRefs {
  const playgroundRef = useRef<HTMLElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dock = dockRef.current;
    const playground = playgroundRef.current;
    if (dock === null || playground === null) return;
    function syncDockHeight(): void {
      if (dock === null || playground === null) return;
      playground.style.setProperty(
        "--query-dock-height",
        `${dock.getBoundingClientRect().height}px`,
      );
    }
    const observer = new ResizeObserver(syncDockHeight);
    observer.observe(dock);
    syncDockHeight();
    return () => {
      observer.disconnect();
    };
  }, []);

  return { dockRef, playgroundRef };
}
