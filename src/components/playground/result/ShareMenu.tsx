import { useEffect, useRef, useState } from "react";
import type { TargetedKeyboardEvent } from "preact";
import type { ReactNode } from "react";

import {
  badgeEndpointUrl,
  badgeHtml,
  badgeLabelText,
  badgeMarkdown,
  badgeUrl,
  DEFAULT_BADGE_OPTIONS,
  embedHtml,
  embedUrl,
  MAX_BADGE_LABEL_LENGTH,
  type BadgeOptions,
  type BadgeShow,
  type BadgeStyle,
  type BadgeTheme,
} from "../../../lib/badge-url.js";
import type { PlaygroundQueryInput } from "../../../lib/playground-contracts.js";
import { CopyButton } from "./CopyButton.js";

/** Everything the menu offers for one result; every value is already absolute. */
export interface ShareLinks {
  readonly apiCommand: string;
  /** The default badge, as copied from the JSON view. */
  readonly badgeImage: string;
  readonly badgeMarkdown: string;
  /** The server the badge and embed card describe: game, host, and ports only. */
  readonly badgeInput: PlaygroundQueryInput;
  /** Where badges and the embed card link to. */
  readonly badgeTarget: string;
  readonly gameName: string;
  readonly origin: string;
  readonly result: string;
}

const BADGE_FORMATS = [
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "url", label: "URL" },
] as const;

type BadgeFormat = (typeof BADGE_FORMATS)[number]["id"];

const STYLE_CHOICES: readonly {
  readonly id: BadgeStyle;
  readonly label: string;
}[] = [
  { id: "flat", label: "Flat" },
  { id: "flat-square", label: "Flat square" },
  { id: "for-the-badge", label: "For the badge" },
];

const SHOW_CHOICES: readonly {
  readonly id: BadgeShow;
  readonly label: string;
}[] = [
  { id: "players", label: "Players" },
  { id: "status", label: "Status only" },
  { id: "players-map", label: "Players and map" },
];

const THEME_CHOICES: readonly {
  readonly id: BadgeTheme;
  readonly label: string;
}[] = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "auto", label: "Match viewer" },
];

function badgeText(
  format: BadgeFormat,
  gameName: string,
  badge: URL,
  target: URL,
): string {
  return format === "markdown"
    ? badgeMarkdown(gameName, badge, target)
    : format === "html"
      ? badgeHtml(gameName, badge, target)
      : badge.href;
}

function Choice<T extends string>({
  choices,
  id,
  label,
  onChange,
  value,
}: {
  readonly choices: readonly { readonly id: T; readonly label: string }[];
  readonly id: string;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly value: T;
}): ReactNode {
  return (
    <label className="share-menu__field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => {
          const next = choices.find(
            (choice) => choice.id === event.currentTarget.value,
          );
          if (next !== undefined) onChange(next.id);
        }}
      >
        {choices.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A disclosure beside the result name with the result link, a status badge
 * builder with three copy formats, an embeddable status card, the shields.io
 * endpoint, and the same query as a public API call.
 */
export function ShareMenu({
  idSuffix = "",
  links,
}: {
  /** Distinguishes a second copy of the menu, as in the pinned result bar. */
  readonly idSuffix?: string;
  readonly links: ShareLinks;
}): ReactNode {
  const panelId = `query-share-panel${idSuffix}`;
  const fieldPrefix = `share-badge${idSuffix}`;
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<BadgeFormat>("markdown");
  const [style, setStyle] = useState<BadgeStyle>(DEFAULT_BADGE_OPTIONS.style);
  const [show, setShow] = useState<BadgeShow>(DEFAULT_BADGE_OPTIONS.show);
  const [theme, setTheme] = useState<BadgeTheme>(DEFAULT_BADGE_OPTIONS.theme);
  const [labelInput, setLabelInput] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Opening moves focus to the first copy action, so the keyboard lands inside.
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
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

  function onKeyDown(event: TargetedKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    setOpen(false);
    triggerRef.current?.focus();
  }

  const label =
    labelInput.trim() === "" ? undefined : badgeLabelText(labelInput);
  const labelRejected = labelInput.trim() !== "" && label === undefined;
  const options: Partial<BadgeOptions> = {
    show,
    style,
    theme,
    ...(label === undefined ? {} : { label }),
  };
  const target = new URL(links.badgeTarget);
  const badge = badgeUrl(links.origin, links.badgeInput, options);
  const badgeCode = badgeText(format, links.gameName, badge, target);
  const embed = embedHtml(
    links.gameName,
    embedUrl(links.origin, links.badgeInput, theme),
  );
  const endpoint = badgeEndpointUrl(
    links.origin,
    links.badgeInput,
    options,
  ).href;
  const labelHintId = `${fieldPrefix}-label-hint`;

  return (
    <div
      className="share-menu"
      ref={rootRef}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && !event.currentTarget.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        className="share-menu__trigger"
        id={`query-result-share${idSuffix}`}
        ref={triggerRef}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 14a4.5 4.5 0 0 0 6.4.4l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2" />
          <path d="M14 10a4.5 4.5 0 0 0-6.4-.4l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2" />
        </svg>
        <span className="share-menu__label">Share</span>
      </button>
      {open && (
        <div
          className="share-menu__panel"
          id={panelId}
          ref={panelRef}
          role="dialog"
          aria-label="Share and embed"
        >
          <section>
            <h3>Result link</h3>
            <div className="share-menu__row">
              <code>{links.result}</code>
              <CopyButton label="Copy" text={links.result} />
            </div>
            <p>Opens this check again, with a live preview card in chats.</p>
          </section>
          <section>
            <div className="share-menu__heading">
              <h3>Status badge</h3>
              <div
                className="share-menu__formats"
                role="radiogroup"
                aria-label="Badge format"
              >
                {BADGE_FORMATS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={format === option.id}
                    tabIndex={format === option.id ? 0 : -1}
                    onClick={() => {
                      setFormat(option.id);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key !== "ArrowLeft" &&
                        event.key !== "ArrowRight"
                      ) {
                        return;
                      }
                      event.preventDefault();
                      const index = BADGE_FORMATS.findIndex(
                        (candidate) => candidate.id === format,
                      );
                      const step = event.key === "ArrowRight" ? 1 : -1;
                      const next =
                        BADGE_FORMATS[
                          (index + step + BADGE_FORMATS.length) %
                            BADGE_FORMATS.length
                        ];
                      if (next === undefined) return;
                      setFormat(next.id);
                      const buttons =
                        event.currentTarget.parentElement?.querySelectorAll(
                          "button",
                        );
                      buttons?.[BADGE_FORMATS.indexOf(next)]?.focus();
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="share-menu__badge">
              {/* Loaded only while the menu is open, so results never spend the badge budget. */}
              <img
                src={badge.href}
                alt={`${links.gameName} server status`}
                height={style === "for-the-badge" ? 28 : 20}
              />
            </div>
            <div className="share-menu__row">
              <code>{badgeCode}</code>
              <CopyButton label="Copy" text={badgeCode} />
            </div>
            <div className="share-menu__options">
              <Choice
                choices={STYLE_CHOICES}
                id={`${fieldPrefix}-style`}
                label="Style"
                onChange={setStyle}
                value={style}
              />
              <Choice
                choices={SHOW_CHOICES}
                id={`${fieldPrefix}-show`}
                label="Shows"
                onChange={setShow}
                value={show}
              />
              <Choice
                choices={THEME_CHOICES}
                id={`${fieldPrefix}-theme`}
                label="Theme"
                onChange={setTheme}
                value={theme}
              />
              <label
                className="share-menu__field"
                htmlFor={`${fieldPrefix}-label`}
              >
                <span>Label</span>
                <input
                  id={`${fieldPrefix}-label`}
                  type="text"
                  value={labelInput}
                  maxLength={MAX_BADGE_LABEL_LENGTH}
                  placeholder={links.gameName}
                  autoComplete="off"
                  spellcheck={false}
                  aria-invalid={labelRejected}
                  aria-describedby={labelRejected ? labelHintId : undefined}
                  onInput={(event) => {
                    setLabelInput(event.currentTarget.value);
                  }}
                />
              </label>
            </div>
            {labelRejected ? (
              <p className="share-menu__hint" id={labelHintId} role="status">
                Labels use letters, digits, spaces, and simple punctuation; this
                one is ignored.
              </p>
            ) : (
              <p>
                Shows this server's live status in a README or on a website.
              </p>
            )}
          </section>
          <section>
            <h3>Embed card</h3>
            <div className="share-menu__row">
              <code>{embed}</code>
              <CopyButton label="Copy" text={embed} />
            </div>
            <p>
              A 360×88 status card for web pages, following the badge theme.
            </p>
          </section>
          <section>
            <h3>shields.io endpoint</h3>
            <div className="share-menu__row">
              <code>{endpoint}</code>
              <CopyButton label="Copy" text={endpoint} />
            </div>
          </section>
          <section>
            <h3>Public API</h3>
            <div className="share-menu__row">
              <code>{links.apiCommand}</code>
              <CopyButton label="Copy" text={links.apiCommand} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
