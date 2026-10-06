import { useEffect } from "react";
import type { RefObject } from "react";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement)
  );
}

/**
 * Focuses `inputRef` when `/` is pressed outside an editable control, the
 * search-field convention. Shift stays allowed for layouts that need it for `/`.
 */
export function useFocusShortcut(
  inputRef: RefObject<HTMLInputElement | null>,
): void {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (
        event.key !== "/" ||
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isEditable(event.target)
      ) {
        return;
      }
      const input = inputRef.current;
      if (input === null) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [inputRef]);
}
