export interface PlaygroundRequestLease {
  isCurrent(): boolean;
  readonly signal: AbortSignal;
}

/** Owns the single active playground request across human and agent callers. */
export class PlaygroundRequestCoordinator {
  readonly #rootSignal: AbortSignal;
  #activeController?: AbortController;
  #sequence = 0;

  public constructor(rootSignal: AbortSignal) {
    this.#rootSignal = rootSignal;
  }

  public start(executionSignal?: AbortSignal): PlaygroundRequestLease {
    this.#activeController?.abort();
    const controller = new AbortController();
    this.#activeController = controller;
    this.#sequence += 1;
    const requestId = this.#sequence;
    const signals = [this.#rootSignal, controller.signal];
    if (executionSignal !== undefined) {
      signals.push(executionSignal);
    }

    return {
      isCurrent: () => requestId === this.#sequence,
      signal: AbortSignal.any(signals),
    };
  }

  public abort(): void {
    this.#activeController?.abort();
    this.#sequence += 1;
  }
}
