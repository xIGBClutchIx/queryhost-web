import { describe, expect, it } from "vitest";

import { ProxyGate } from "../src/server/proxy-gate.js";

const POLICY = {
  maxActive: 2,
  maxStartsPerCaller: 2,
  maxStartsPerWindow: 3,
  maxTrackedCallers: 2,
  windowMs: 1_000,
} as const;

describe("public proxy gate", () => {
  it("limits each caller and releases active capacity once", () => {
    const gate = new ProxyGate(POLICY);
    const first = gate.admit("caller-a", 0);
    expect(first.accepted).toBe(true);
    if (!first.accepted) {
      throw new Error("The first admission should succeed.");
    }
    first.release();
    first.release();
    expect(gate.active).toBe(0);

    const second = gate.admit("caller-a", 1);
    expect(second.accepted).toBe(true);
    if (second.accepted) {
      second.release();
    }
    const rejected = gate.admit("caller-a", 2);
    expect(rejected).toEqual({ accepted: false, retryAfterSeconds: 1 });
  });

  it("bounds global starts, active work, and tracked caller memory", () => {
    const gate = new ProxyGate(POLICY);
    const first = gate.admit("caller-a", 0);
    const second = gate.admit("caller-b", 0);
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    expect(gate.trackedCallers).toBe(2);
    expect(gate.admit("caller-c", 0)).toEqual({
      accepted: false,
      retryAfterSeconds: 1,
    });

    if (first.accepted) {
      first.release();
    }
    const third = gate.admit("caller-a", 1);
    expect(third.accepted).toBe(true);
    if (second.accepted) {
      second.release();
    }
    if (third.accepted) {
      third.release();
    }
    expect(gate.admit("caller-b", 2)).toEqual({
      accepted: false,
      retryAfterSeconds: 1,
    });
  });

  it("expires counters and tracked callers after the bounded window", () => {
    const gate = new ProxyGate(POLICY);
    const first = gate.admit("caller-a", 0);
    if (first.accepted) {
      first.release();
    }
    expect(gate.trackedCallers).toBe(1);

    const nextWindow = gate.admit("caller-c", 1_000);
    expect(nextWindow.accepted).toBe(true);
    expect(gate.trackedCallers).toBe(1);
  });
});
