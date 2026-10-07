import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import "../../styles/playground.css";

export interface SelectOption<V extends string> {
  readonly label: string;
  readonly value: V;
}

interface CustomSelectProps<V extends string> {
  /** Accessible name and placeholder for a type-to-filter box; omit for short lists. */
  readonly filterLabel?: string;
  readonly help?: string;
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: V) => void;
  readonly options: readonly SelectOption<V>[];
  readonly required?: boolean;
  readonly value: V;
}

type FocusTarget = "filter" | "first" | "last" | "selected";

interface ScrollEdges {
  readonly above: boolean;
  readonly below: boolean;
}

const NO_OVERFLOW: ScrollEdges = { above: false, below: false };

function scrollEdges(list: HTMLElement): ScrollEdges {
  return {
    above: list.scrollTop > 1,
    below: list.scrollTop + list.clientHeight < list.scrollHeight - 1,
  };
}

/**
 * Ranks a label against a filter: 0 for a prefix, 1 for a word prefix, 2 for any
 * other substring, undefined for no match. Enter picks the best-ranked option.
 */
function matchRank(label: string, query: string): number | undefined {
  const text = label.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  const at = text.indexOf(needle);
  if (at < 0) return undefined;
  if (at === 0) return 0;
  return text.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(needle))
    ? 1
    : 2;
}

function filterOptions<V extends string>(
  options: readonly SelectOption<V>[],
  query: string,
): readonly SelectOption<V>[] {
  return options
    .flatMap((option) => {
      const rank = matchRank(option.label, query);
      return rank === undefined ? [] : [{ option, rank }];
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ option }) => option);
}

function isTypingKey(event: KeyboardEvent): boolean {
  return (
    event.key.length === 1 &&
    event.key !== " " &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  );
}

/**
 * Styled listbox that keeps a hidden native select in the form, so form semantics and
 * autofill keep working while the visible control follows the keyboard listbox pattern.
 */
export function CustomSelect<V extends string>({
  filterLabel,
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
  const [query, setQuery] = useState("");
  const [edges, setEdges] = useState<ScrollEdges>(NO_OVERFLOW);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const pendingFocus = useRef<FocusTarget | undefined>(undefined);
  const revealSelected = useRef(false);
  const pointerType = useRef("");
  const selected = options.find((option) => option.value === value);
  if (selected === undefined) {
    throw new Error(`Custom select ${id} has no selected option.`);
  }

  const filterable = filterLabel !== undefined;
  const visible = filterable ? filterOptions(options, query) : options;
  const selectedIndex = visible.findIndex((option) => option.value === value);

  const labelId = `${id}-label`;
  const valueId = `${id}-value`;
  const menuId = `${id}-menu`;

  function focusOption(target: FocusTarget): void {
    if (target === "filter") {
      filterRef.current?.focus();
      return;
    }
    const index =
      target === "first"
        ? 0
        : target === "last"
          ? visible.length - 1
          : Math.max(selectedIndex, 0);
    optionRefs.current[index]?.focus();
  }

  // Options are inert while closed, so keyboard focus moves only after the menu opens.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = undefined;
    if (open && target !== undefined) focusOption(target);
  });

  // Open on the selected option, so a long list shows where the current choice sits;
  // later renders (filtering) keep the user's scroll position.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !revealSelected.current || list === null) return;
    revealSelected.current = false;
    const option = optionRefs.current[selectedIndex];
    if (option !== null && option !== undefined) {
      list.scrollTop =
        option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
    }
  });

  // The edge fades say whether more options sit above or below the visible rows.
  useLayoutEffect(() => {
    const list = listRef.current;
    setEdges(open && list !== null ? scrollEdges(list) : NO_OVERFLOW);
  }, [open, query]);

  useEffect(() => {
    if (!open) return;
    function closeFromOutside(event: PointerEvent): void {
      const target = event.target;
      if (
        target instanceof Node &&
        rootRef.current?.contains(target) !== true
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("pointerdown", closeFromOutside);
    return () => {
      document.removeEventListener("pointerdown", closeFromOutside);
    };
  }, [open]);

  function close(): void {
    setOpen(false);
    setQuery("");
  }

  function openMenu(target: FocusTarget | undefined): void {
    pendingFocus.current = target;
    revealSelected.current = true;
    setOpen(true);
  }

  function openWithFocus(target: FocusTarget): void {
    if (open) focusOption(target);
    else openMenu(target);
  }

  function closeAndReturnFocus(): void {
    close();
    triggerRef.current?.focus();
  }

  function choose(option: SelectOption<V>): void {
    onChange(option.value);
    closeAndReturnFocus();
  }

  /** Starts or extends the filter from a key typed anywhere in the control. */
  function typeIntoFilter(event: KeyboardEvent<HTMLElement>): boolean {
    if (!filterable || !isTypingKey(event)) return false;
    event.preventDefault();
    setQuery((current) => (open ? current : "") + event.key);
    openWithFocus("filter");
    return true;
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (typeIntoFilter(event)) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    openWithFocus(event.key === "ArrowDown" ? "selected" : "last");
  }

  function onFilterKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      if (query === "") closeAndReturnFocus();
      else setQuery("");
      return;
    }
    if (event.key === "Enter") {
      // Enter picks the best match instead of submitting the surrounding form.
      event.preventDefault();
      const first = visible[0];
      if (first !== undefined) choose(first);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(event.key === "ArrowDown" ? "first" : "last");
    }
  }

  function onOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ): void {
    if (typeIntoFilter(event)) return;
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
    const next = index + (event.key === "ArrowDown" ? 1 : -1);
    if (filterable && (next < 0 || next >= visible.length)) {
      focusOption("filter");
      return;
    }
    optionRefs.current[(next + visible.length) % visible.length]?.focus();
  }

  const listClasses = ["custom-select__list"];
  if (edges.above) listClasses.push("has-more-above");
  if (edges.below) listClasses.push("has-more-below");

  return (
    <div className="field">
      <span id={labelId}>{label}</span>
      <div
        className={open ? "custom-select is-open" : "custom-select"}
        ref={rootRef}
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (!(next instanceof Node) || !event.currentTarget.contains(next)) {
            close();
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
          onPointerDown={(event) => {
            pointerType.current = event.pointerType;
          }}
          onClick={() => {
            const touch =
              pointerType.current === "touch" || pointerType.current === "pen";
            pointerType.current = "";
            if (open) {
              close();
              return;
            }
            // Mouse and keyboard opens land in the filter; touch skips it so the
            // on-screen keyboard does not cover the list.
            openMenu(filterable && !touch ? "filter" : undefined);
          }}
          onKeyDown={onTriggerKeyDown}
        >
          <span id={valueId}>{selected.label}</span>
          <span className="custom-select__chevron" aria-hidden="true" />
        </button>
        <div className="custom-select__menu" aria-hidden={!open} inert={!open}>
          {filterable && (
            <input
              className="custom-select__filter"
              ref={filterRef}
              type="search"
              enterKeyHint="go"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={filterLabel}
              aria-label={filterLabel}
              aria-controls={menuId}
              value={query}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
              }}
              onKeyDown={onFilterKeyDown}
            />
          )}
          <div
            className={listClasses.join(" ")}
            id={menuId}
            ref={listRef}
            role="listbox"
            aria-labelledby={labelId}
            onScroll={(event) => {
              setEdges(scrollEdges(event.currentTarget));
            }}
          >
            {visible.map((option, index) => (
              <button
                key={option.value}
                ref={(element) => {
                  optionRefs.current[index] = element;
                }}
                className={
                  // Marks the match that Enter in the filter picks.
                  index === 0 && query.trim() !== ""
                    ? "custom-select__option is-default"
                    : "custom-select__option"
                }
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  choose(option);
                }}
                onKeyDown={(event) => {
                  onOptionKeyDown(event, index);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          {filterable && visible.length === 0 && (
            <p className="custom-select__empty" role="status">
              No matches for “{query.trim()}”
            </p>
          )}
        </div>
      </div>
      {help !== undefined && <small>{help}</small>}
    </div>
  );
}
