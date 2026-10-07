import type {
  Dispatch,
  ReactNode,
  RefObject,
  SetStateAction,
  SubmitEvent,
} from "react";

import type { PlaygroundGameDefinition } from "../../lib/playground-contracts.js";
import { findGame, gameFields, selectGame } from "../../lib/playground-form.js";
import type {
  PlaygroundFormState,
  PlaygroundTimeout,
} from "../../lib/playground-form.js";
import { CustomSelect } from "./CustomSelect.js";
import type { SelectOption } from "./CustomSelect.js";

const MODE_OPTIONS: readonly SelectOption<"full" | "summary">[] = [
  { label: "Full details", value: "full" },
  { label: "Summary only", value: "summary" },
];

const TIMEOUT_OPTIONS: readonly SelectOption<PlaygroundTimeout>[] = [
  { label: "3 seconds", value: "3000" },
  { label: "5 seconds", value: "5000" },
];

interface QueryFormProps {
  readonly error: string | undefined;
  readonly form: PlaygroundFormState;
  readonly formRef: RefObject<HTMLFormElement | null>;
  readonly games: readonly PlaygroundGameDefinition[];
  /** Receives focus when the address fails validation. */
  readonly hostRef: RefObject<HTMLInputElement | null>;
  readonly loading: boolean;
  readonly onFormChange: Dispatch<SetStateAction<PlaygroundFormState>>;
  readonly onSubmit: (event: SubmitEvent<HTMLFormElement>) => void;
}

/** The playground's controlled query form; parsing and submission stay with the caller. */
export function QueryForm({
  error,
  form,
  formRef,
  games,
  hostRef,
  loading,
  onFormChange,
  onSubmit,
}: QueryFormProps): ReactNode {
  const game = findGame(games, form.game);
  if (game === undefined) {
    throw new Error("The selected game is not in the package registry.");
  }
  const fields = gameFields(game);
  const gameOptions = games.map((candidate) => ({
    label: candidate.name,
    value: candidate.id,
  }));

  function update(changes: Partial<PlaygroundFormState>): void {
    onFormChange((current) => ({ ...current, ...changes }));
  }

  return (
    <form
      className="query-form"
      id="query-form"
      ref={formRef}
      onSubmit={onSubmit}
    >
      <div className="query-form__primary">
        <CustomSelect
          id="query-game"
          name="game"
          label="Game"
          filterLabel="Filter games"
          options={gameOptions}
          value={form.game}
          required
          onChange={(id) => {
            const next = findGame(games, id);
            if (next !== undefined) {
              onFormChange((current) =>
                selectGame(current, findGame(games, current.game), next),
              );
            }
          }}
        />

        <label className="field field--host">
          <span>Host or IP</span>
          <input
            id="query-host"
            ref={hostRef}
            name="host"
            type="text"
            required
            maxLength={253}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="play.example.com"
            aria-keyshortcuts="/"
            value={form.host}
            onChange={(event) => {
              update({ host: event.currentTarget.value });
            }}
          />
          <kbd className="field__shortcut" aria-hidden="true">
            /
          </kbd>
        </label>

        <label className="field">
          <span id="query-port-label">{fields.portLabel}</span>
          <input
            id="query-port"
            name="port"
            type="number"
            min="1"
            max="65535"
            inputMode="numeric"
            required={fields.portRequired}
            value={form.port}
            onChange={(event) => {
              update({ port: event.currentTarget.value });
            }}
          />
        </label>

        <button
          className="query-submit"
          id="query-submit"
          type="submit"
          disabled={loading}
        >
          {loading ? "Querying…" : "Query"}
        </button>
      </div>

      <div
        className={
          form.advancedOpen
            ? "query-form__advanced is-open"
            : "query-form__advanced"
        }
        id="query-advanced"
      >
        <button
          className="query-form__advanced-trigger"
          id="query-advanced-trigger"
          type="button"
          aria-expanded={form.advancedOpen}
          aria-controls="query-advanced-content"
          onClick={() => {
            update({ advancedOpen: !form.advancedOpen });
          }}
        >
          Advanced options
        </button>
        <div
          className="query-form__advanced-content"
          id="query-advanced-content"
          aria-hidden={!form.advancedOpen}
          inert={!form.advancedOpen}
        >
          <div className="query-form__advanced-content-inner">
            <div className="query-form__secondary">
              <label
                className="field field--compact"
                id="query-query-port-field"
                hidden={!fields.queryPortAvailable}
              >
                <span>Query port</span>
                <input
                  id="query-query-port"
                  name="queryPort"
                  type="number"
                  min="1"
                  max="65535"
                  inputMode="numeric"
                  placeholder={fields.queryPortPlaceholder}
                  disabled={!fields.queryPortAvailable}
                  value={form.queryPort}
                  onChange={(event) => {
                    update({ queryPort: event.currentTarget.value });
                  }}
                />
                <small id="query-port-help">{fields.queryPortHelp}</small>
              </label>

              <CustomSelect
                id="query-mode"
                name="mode"
                label="Mode"
                options={MODE_OPTIONS}
                value={form.mode}
                help="Full mode requests optional sources."
                onChange={(mode) => {
                  update({ mode });
                }}
              />

              <CustomSelect
                id="query-timeout"
                name="timeoutMs"
                label="Deadline"
                options={TIMEOUT_OPTIONS}
                value={form.timeoutMs}
                help="One deadline for the entire query."
                onChange={(timeoutMs) => {
                  update({ timeoutMs });
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <p
        className="query-form__error"
        id="query-form-error"
        role="alert"
        hidden={error === undefined}
      >
        {error}
      </p>
    </form>
  );
}
