import { useEffect, useRef, useState } from "react";
import type { TargetedKeyboardEvent } from "preact";
import type { ReactNode } from "react";

import { CopyButton } from "./CopyButton.js";

/** Everything the menu offers for one result; every value is already absolute. */
export interface ShareLinks {
  readonly apiCommand: string;
  readonly badgeHtml: string;
  readonly badgeImage: string;
  readonly badgeMarkdown: string;
  /** Accessible name of the badge image. */
  readonly badgeLabel: string;
  readonly result: string;
}

const BADGE_FORMATS = [
  { id: "markdown", label: "Markdown" },
  { id: "html", label: "HTML" },
  { id: "url", label: "URL" },
] as const;

type BadgeFormat = (typeof BADGE_FORMATS)[number]["id"];

function badgeText(links: ShareLinks, format: BadgeFormat): string {
  return format === "markdown"
    ? links.badgeMarkdown
    : format === "html"
      ? links.badgeHtml
      : links.badgeImage;
}

/**
 * A disclosure beside the result name with the result link, an embeddable
 * status badge in three formats, and the same query as a public API call.
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
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<BadgeFormat>("markdown");
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
              <img src={links.badgeImage} alt={links.badgeLabel} height={20} />
            </div>
            <div className="share-menu__row">
              <code>{badgeText(links, format)}</code>
              <CopyButton label="Copy" text={badgeText(links, format)} />
            </div>
            <p>Shows this server's live status in a README or on a website.</p>
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
