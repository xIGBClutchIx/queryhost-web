import type { ProxyGateRejectionReason } from "./proxy-gate.js";

type UpstreamCacheStatus = "hit" | "miss" | "coalesced";

export interface SurfaceUsageSnapshot {
  readonly requests: {
    readonly invalid: number;
    readonly rateLimited: number;
    readonly forwarded: number;
    readonly unavailable: number;
  };
  readonly rateLimited: Readonly<Record<ProxyGateRejectionReason, number>>;
  readonly upstreamStatus: Readonly<Record<string, number>>;
  readonly cache: Readonly<Record<UpstreamCacheStatus, number>>;
}

export interface GamesUsageSnapshot {
  readonly ok: number;
  readonly notModified: number;
}

function isCacheStatus(value: string | null): value is UpstreamCacheStatus {
  return value === "hit" || value === "miss" || value === "coalesced";
}

/**
 * Aggregate counters for one query surface. Keys come from closed sets (gate
 * reasons, cache statuses, HTTP status codes), so memory stays bounded and no
 * caller, target, or result is ever recorded.
 */
export class SurfaceUsage {
  #invalid = 0;
  #forwarded = 0;
  #unavailable = 0;
  readonly #rateLimited: Record<ProxyGateRejectionReason, number> = {
    active: 0,
    window: 0,
    caller: 0,
    callers: 0,
  };
  readonly #upstreamStatus = new Map<string, number>();
  readonly #cache: Record<UpstreamCacheStatus, number> = {
    hit: 0,
    miss: 0,
    coalesced: 0,
  };

  public recordInvalid(): void {
    this.#invalid += 1;
  }

  public recordRateLimited(reason: ProxyGateRejectionReason): void {
    this.#rateLimited[reason] += 1;
  }

  public recordUnavailable(): void {
    this.#unavailable += 1;
  }

  /** Records a response relayed from the query service or the local runner. */
  public recordForwarded(status: number, cache: string | null): void {
    this.#forwarded += 1;
    const key = String(status);
    this.#upstreamStatus.set(key, (this.#upstreamStatus.get(key) ?? 0) + 1);
    if (isCacheStatus(cache)) {
      this.#cache[cache] += 1;
    }
  }

  public snapshot(): SurfaceUsageSnapshot {
    const rateLimited = Object.values(this.#rateLimited).reduce(
      (total, count) => total + count,
      0,
    );
    return {
      requests: {
        invalid: this.#invalid,
        rateLimited,
        forwarded: this.#forwarded,
        unavailable: this.#unavailable,
      },
      rateLimited: { ...this.#rateLimited },
      upstreamStatus: Object.fromEntries(
        [...this.#upstreamStatus].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      cache: { ...this.#cache },
    };
  }
}

/** Counts full and conditional (`304`) responses from the public games route. */
export class GamesUsage {
  #ok = 0;
  #notModified = 0;

  public record(notModified: boolean): void {
    if (notModified) {
      this.#notModified += 1;
    } else {
      this.#ok += 1;
    }
  }

  public snapshot(): GamesUsageSnapshot {
    return { ok: this.#ok, notModified: this.#notModified };
  }
}
