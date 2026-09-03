import { describe, expect, it } from "vitest";

import { PlaygroundRequestCoordinator } from "../src/lib/playground-request-coordinator.js";

describe("playground request coordinator", () => {
  it("cancels and invalidates an older human or agent request", () => {
    const coordinator = new PlaygroundRequestCoordinator(
      new AbortController().signal,
    );
    const older = coordinator.start();
    const newer = coordinator.start();

    expect(older.signal.aborted).toBe(true);
    expect(older.isCurrent()).toBe(false);
    expect(newer.signal.aborted).toBe(false);
    expect(newer.isCurrent()).toBe(true);
  });

  it("combines agent cancellation without invalidating request identity", () => {
    const coordinator = new PlaygroundRequestCoordinator(
      new AbortController().signal,
    );
    const executionController = new AbortController();
    const request = coordinator.start(executionController.signal);

    executionController.abort();

    expect(request.signal.aborted).toBe(true);
    expect(request.isCurrent()).toBe(true);
  });

  it("aborts the active request during document cleanup", () => {
    const rootController = new AbortController();
    const coordinator = new PlaygroundRequestCoordinator(rootController.signal);
    const request = coordinator.start();

    rootController.abort();

    expect(request.signal.aborted).toBe(true);
  });
});
