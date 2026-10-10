export interface ProxyGatePolicy {
  readonly maxActive: number;
  readonly maxStartsPerCaller: number;
  readonly maxStartsPerWindow: number;
  readonly maxTrackedCallers: number;
  readonly windowMs: number;
}

interface CallerWindow {
  count: number;
  expiresAt: number;
}

export interface ProxyGateLease {
  readonly accepted: true;
  release(): void;
}

/** Which bound rejected a caller: active work, the global window, the caller's own budget, or tracked-caller memory. */
export type ProxyGateRejectionReason =
  "active" | "window" | "caller" | "callers";

export interface ProxyGateRejection {
  readonly accepted: false;
  readonly reason: ProxyGateRejectionReason;
  readonly retryAfterSeconds: number;
}

export type ProxyGateResult = ProxyGateLease | ProxyGateRejection;

function retryAfterSeconds(now: number, expiresAt: number): number {
  return Math.max(1, Math.ceil((expiresAt - now) / 1_000));
}

/** Bounded in-memory admission control for the public caller boundary. */
export class ProxyGate {
  readonly #callers = new Map<string, CallerWindow>();
  readonly #policy: ProxyGatePolicy;
  #active = 0;
  #globalCount = 0;
  #globalExpiresAt = 0;

  public constructor(policy: ProxyGatePolicy) {
    this.#policy = policy;
  }

  public get active(): number {
    return this.#active;
  }

  public get trackedCallers(): number {
    return this.#callers.size;
  }

  /**
   * Admits one request that counts as `cost` starts in both windows, such as a
   * detection that may probe several protocols.
   */
  public admit(
    caller: string,
    now: number = Date.now(),
    cost = 1,
  ): ProxyGateResult {
    this.#refresh(now);

    if (this.#active >= this.#policy.maxActive) {
      return { accepted: false, reason: "active", retryAfterSeconds: 1 };
    }

    if (this.#globalCount + cost > this.#policy.maxStartsPerWindow) {
      return {
        accepted: false,
        reason: "window",
        retryAfterSeconds: retryAfterSeconds(now, this.#globalExpiresAt),
      };
    }

    const existing = this.#callers.get(caller);
    if (
      existing !== undefined &&
      existing.count + cost > this.#policy.maxStartsPerCaller
    ) {
      return {
        accepted: false,
        reason: "caller",
        retryAfterSeconds: retryAfterSeconds(now, existing.expiresAt),
      };
    }

    if (
      existing === undefined &&
      this.#callers.size >= this.#policy.maxTrackedCallers
    ) {
      return {
        accepted: false,
        reason: "callers",
        retryAfterSeconds: retryAfterSeconds(now, this.#globalExpiresAt),
      };
    }

    if (existing === undefined && cost > this.#policy.maxStartsPerCaller) {
      return {
        accepted: false,
        reason: "caller",
        retryAfterSeconds: retryAfterSeconds(now, this.#globalExpiresAt),
      };
    }

    if (existing === undefined) {
      this.#callers.set(caller, {
        count: cost,
        expiresAt: this.#globalExpiresAt,
      });
    } else {
      existing.count += cost;
    }
    this.#globalCount += cost;
    this.#active += 1;

    let released = false;
    return {
      accepted: true,
      release: () => {
        if (!released) {
          released = true;
          this.#active -= 1;
        }
      },
    };
  }

  #refresh(now: number): void {
    if (now >= this.#globalExpiresAt) {
      this.#globalCount = 0;
      this.#globalExpiresAt = now + this.#policy.windowMs;
    }

    for (const [caller, window] of this.#callers) {
      if (now >= window.expiresAt) {
        this.#callers.delete(caller);
      }
    }
  }
}
