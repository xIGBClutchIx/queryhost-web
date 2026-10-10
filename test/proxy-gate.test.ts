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
    expect(rejected).toEqual({
      accepted: false,
      reason: "caller",
      retryAfterSeconds: 1,
    });
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
      reason: "active",
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
      reason: "window",
      retryAfterSeconds: 1,
    });
  });

  it("names tracked-caller memory as the rejecting bound", () => {
    const gate = new ProxyGate({ ...POLICY, maxStartsPerWindow: 10 });
    for (const caller of ["caller-a", "caller-b"]) {
      const lease = gate.admit(caller, 0);
      if (lease.accepted) {
        lease.release();
      }
    }
    expect(gate.admit("caller-c", 0)).toMatchObject({
      accepted: false,
      reason: "callers",
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

  it("charges weighted requests against caller and global budgets", () => {
    const gate = new ProxyGate({
      ...POLICY,
      maxStartsPerCaller: 4,
      maxStartsPerWindow: 5,
    });
    const detection = gate.admit("caller-a", 0, 4);
    expect(detection.accepted).toBe(true);
    if (detection.accepted) detection.release();
    expect(gate.admit("caller-a", 1)).toMatchObject({ reason: "caller" });
    expect(gate.admit("caller-b", 1, 2)).toMatchObject({ reason: "window" });
    expect(gate.admit("caller-c", 1, 5)).toMatchObject({ reason: "window" });
    expect(gate.admit("caller-b", 1).accepted).toBe(true);
    expect(gate.admit("caller-d", 1_000, 5)).toMatchObject({
      reason: "caller",
    });
  });
});
