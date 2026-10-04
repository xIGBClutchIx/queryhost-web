import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface SelectOption<V extends string> {
  readonly label: string;
  readonly value: V;
}

interface CustomSelectProps<V extends string> {
  readonly help?: string;
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: V) => void;
  readonly options: readonly SelectOption<V>[];
  readonly required?: boolean;
  readonly value: V;
}

type FocusTarget = "first" | "last" | "selected";

/**
 * Styled listbox that keeps a hidden native select in the form, so form semantics and
 * autofill keep working while the visible control follows the keyboard listbox pattern.
 */
export function CustomSelect<V extends string>({
  help,
  id,
  label,
  name,
  onChange,
  options,
  required = false,
  value,
}: CustomSelectProps<V>): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<FocusTarget | undefined>(undefined);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const selected = options[selectedIndex];
  if (selected === undefined) {
    throw new Error(`Custom select ${id} has no selected option.`);
  }

  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const menuId = `${id}-menu`;

  function focusOption(target: FocusTarget): void {
    const index =
      target === "first"
        ? 0
        : target === "last"
          ? options.length - 1
          : selectedIndex;
    optionRefs.current[index]?.focus();
  }

  // Options are inert while closed, so keyboard focus moves only after the menu opens.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = undefined;
    if (open && target !== undefined) focusOption(target);
  });

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current?.contains(target) !== true
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [open]);

  function openWithFocus(target: FocusTarget): void {
    if (open) {
      focusOption(target);
      return;
    }
    pendingFocus.current = target;
    setOpen(true);
  }

  function closeAndReturnFocus(): void {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    openWithFocus(event.key === "ArrowDown" ? "selected" : "last");
  }

  function onOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndReturnFocus();
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      openWithFocus(event.key === "Home" ? "first" : "last");
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    optionRefs.current[
      (index + direction + options.length) % options.length
    ]?.focus();
  }

  return (
    <div className="field">
      <span id={labelId}>{label}</span>
      <div
        className={open ? "custom-select is-open" : "custom-select"}
        ref={rootRef}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            setOpen(false);
          }
        }}
      >
        <select
          className="custom-select__native"
          id={id}
          name={name}
          required={required}
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          onChange={(event) => {
            const option = options.find(
              (candidate) => candidate.value === event.currentTarget.value,
            );
            if (option !== undefined) onChange(option.value);
          }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="custom-select__trigger"
          type="button"
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={menuId}
          aria-labelledby={`${labelId} ${valueId}`}
          onClick={() => {
            setOpen(!open);
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <span id={valueId}>{selected.label}</span>
          <span className="custom-select__chevron" aria-hidden="true" />
        </button>
        <div
          className="custom-select__menu"
          id={menuId}
          role="listbox"
          aria-labelledby={labelId}
          aria-hidden={!open}
          inert={!open}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              className="custom-select__option"
              type="button"
              role="option"
              aria-selected={option.value === value}
              onClick={() => {
                onChange(option.value);
                closeAndReturnFocus();
              }}
              onKeyDown={(event) => {
                onOptionKeyDown(event, index);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      {help !== undefined && <small>{help}</small>}
    </div>
  );
}
