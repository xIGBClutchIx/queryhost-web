import { useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabDefinition<Id extends string> {
  readonly id: Id;
  readonly label: string;
}

interface TabsProps<Id extends string> {
  /** Selected tab id. */
  readonly active: Id;
  /** Visually hidden name for the tab list. */
  readonly label: string;
  /** Prefix for `${idPrefix}-tab-${id}` and the `${idPrefix}-panel-${id}` it controls. */
  readonly idPrefix: string;
  readonly onChange: (id: Id) => void;
  readonly tabs: readonly TabDefinition<Id>[];
  readonly className?: string;
}

/** Keys that move selection, as offsets from the current tab or absolute positions. */
function targetIndex(key: string, index: number, count: number): number {
  switch (key) {
    case "ArrowLeft":
      return (index - 1 + count) % count;
    case "ArrowRight":
      return (index + 1) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return -1;
  }
}

/**
 * ARIA tab list with a roving tabindex. Arrow keys wrap, Home and End jump, and
 * selection follows focus. Render each panel with {@link TabPanel}.
 */
export function Tabs<Id extends string>({
  active,
  className,
  idPrefix,
  label,
  onChange,
  tabs,
}: TabsProps<Id>): ReactNode {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    const nextIndex = targetIndex(event.key, index, tabs.length);
    const next = tabs[nextIndex];
    if (next === undefined) return;
    event.preventDefault();
    onChange(next.id);
    tabRefs.current[nextIndex]?.focus();
  }

  return (
    <div className={className} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => (
        <button
          key={tab.id}
          ref={(element) => {
            tabRefs.current[index] = element;
          }}
          type="button"
          role="tab"
          id={`${idPrefix}-tab-${tab.id}`}
          aria-controls={`${idPrefix}-panel-${tab.id}`}
          aria-selected={active === tab.id}
          tabIndex={active === tab.id ? 0 : -1}
          onClick={() => {
            onChange(tab.id);
          }}
          onKeyDown={(event) => {
            onKeyDown(event, index);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

interface TabPanelProps<Id extends string> {
  readonly active: Id;
  readonly children: ReactNode;
  readonly id: Id;
  readonly idPrefix: string;
  readonly className?: string;
}

/** Panel paired with a {@link Tabs} button; inactive panels stay mounted but hidden. */
export function TabPanel<Id extends string>({
  active,
  children,
  className,
  id,
  idPrefix,
}: TabPanelProps<Id>): ReactNode {
  return (
    <div
      className={className}
      id={`${idPrefix}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={active !== id}
    >
      {children}
    </div>
  );
}
