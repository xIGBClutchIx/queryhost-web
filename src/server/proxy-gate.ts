export interface ProxyGatePolicy {
  readonly maxActive: number;
  /**
   * How many admitted requests one caller may hold at once, so a single caller
   * cannot occupy every active slot. Omitted for single-caller budgets.
   */
  readonly maxActivePerCaller?: number;
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

/**
 * Which bound rejected a caller: active work, the caller's own active work,
 * the global window, the caller's own budget, or tracked-caller memory.
 */
export type ProxyGateRejectionReason =
  "active" | "callerActive" | "window" | "caller" | "callers";

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
  /** Active leases per caller; an entry exists only while it holds one, so it never exceeds `maxActive`. */
  readonly #activeByCaller = new Map<string, number>();
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
   * detection that may probe several protocols. A lower `windowLimit` stops
   * this request early in the global window, leaving the rest for others.
   */
  public admit(
    caller: string,
    now: number = Date.now(),
    cost = 1,
    windowLimit: number = this.#policy.maxStartsPerWindow,
  ): ProxyGateResult {
    const rejection = this.#check(caller, now, cost, windowLimit);
    if (rejection !== undefined) {
      return rejection;
    }

    const existing = this.#callers.get(caller);
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
    this.#activeByCaller.set(
      caller,
      (this.#activeByCaller.get(caller) ?? 0) + 1,
    );

    let released = false;
    return {
      accepted: true,
      release: () => {
        if (!released) {
          released = true;
          this.#active -= 1;
          const held = (this.#activeByCaller.get(caller) ?? 1) - 1;
          if (held > 0) {
            this.#activeByCaller.set(caller, held);
          } else {
            this.#activeByCaller.delete(caller);
          }
        }
      },
    };
  }

  /**
   * Whether the windows still have room for `cost` starts by this caller,
   * without spending any. Active slots are ignored because they free up on
   * their own; this lets a caller skip costly work it could never use.
   */
  public hasStartBudget(
    caller: string,
    now: number = Date.now(),
    cost = 1,
  ): boolean {
    this.#refresh(now);
    return this.#checkBudget(caller, now, cost) === undefined;
  }

  #check(
    caller: string,
    now: number,
    cost: number,
    windowLimit: number,
  ): ProxyGateRejection | undefined {
    this.#refresh(now);

    if (this.#active >= this.#policy.maxActive) {
      return { accepted: false, reason: "active", retryAfterSeconds: 1 };
    }

    const perCaller = this.#policy.maxActivePerCaller;
    if (
      perCaller !== undefined &&
      (this.#activeByCaller.get(caller) ?? 0) >= perCaller
    ) {
      return { accepted: false, reason: "callerActive", retryAfterSeconds: 1 };
    }

    return this.#checkBudget(caller, now, cost, windowLimit);
  }

  #checkBudget(
    caller: string,
    now: number,
    cost: number,
    windowLimit: number = this.#policy.maxStartsPerWindow,
  ): ProxyGateRejection | undefined {
    if (
      this.#globalCount + cost >
      Math.min(windowLimit, this.#policy.maxStartsPerWindow)
    ) {
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

    return undefined;
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
