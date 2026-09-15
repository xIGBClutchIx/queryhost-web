/** Owns browser resources for a single connected component. */
export class BrowserScope {
  public readonly controller = new AbortController();
  readonly #root: HTMLElement;
  readonly #cleanup: (() => void)[] = [];
  readonly #timers = new Set<number>();

  public constructor(root: HTMLElement) {
    this.#root = root;
  }

  public get active(): boolean {
    return !this.controller.signal.aborted && this.#root.isConnected;
  }

  public listen<K extends keyof HTMLElementEventMap>(
    target: EventTarget,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void,
  ): void {
    target.addEventListener(type, listener as EventListener, {
      signal: this.controller.signal,
    });
  }

  public setTimeout(callback: () => void, delay: number): void {
    const timer = window.setTimeout(() => {
      this.#timers.delete(timer);
      if (this.active) callback();
    }, delay);
    this.#timers.add(timer);
  }

  public onDispose(callback: () => void): void {
    this.#cleanup.push(callback);
  }

  public dispose(): void {
    if (this.controller.signal.aborted) return;
    this.controller.abort();
    for (const timer of this.#timers) window.clearTimeout(timer);
    this.#timers.clear();
    for (const cleanup of this.#cleanup.splice(0)) cleanup();
  }
}
