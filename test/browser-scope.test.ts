import { afterEach, expect, it, vi } from "vitest";
import { BrowserScope } from "../src/lib/browser-scope.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("removes listeners and timers and disposes resources exactly once", () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const scope = new BrowserScope({ isConnected: true } as HTMLElement);
  const target = new EventTarget();
  const listener = vi.fn();
  const timer = vi.fn();
  const cleanup = vi.fn();
  scope.listen(target, "click", listener);
  scope.setTimeout(timer, 1500);
  scope.onDispose(cleanup);
  target.dispatchEvent(new Event("click"));
  scope.dispose();
  scope.dispose();
  target.dispatchEvent(new Event("click"));
  vi.runAllTimers();
  expect(listener).toHaveBeenCalledTimes(1);
  expect(timer).not.toHaveBeenCalled();
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(scope.active).toBe(false);
});

it("does not run delayed feedback against detached elements", () => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const root = { isConnected: true };
  const scope = new BrowserScope(root as HTMLElement);
  const callback = vi.fn();
  scope.setTimeout(callback, 1500);
  root.isConnected = false;
  vi.runAllTimers();
  expect(callback).not.toHaveBeenCalled();
  scope.dispose();
});
