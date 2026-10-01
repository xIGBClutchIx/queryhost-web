import { describe, expect, it } from "vitest";
import { readBoundedText } from "../src/server/bounded-text.js";

describe("bounded body reader", () => {
  it("counts bytes across chunks, cancels excess data, and releases the reader", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      readBoundedText(body, 3, new AbortController().signal),
    ).rejects.toThrow(RangeError);
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it("cancels a stalled reader on abort without waiting for another chunk", async () => {
    let cancelled = false;
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const pending = readBoundedText(body, 20, controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(cancelled).toBe(true);
    expect(body.locked).toBe(false);
  });

  it("decodes UTF-8 split between chunks and rejects malformed encoding", async () => {
    const encoded = new TextEncoder().encode("é");
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 1));
        controller.enqueue(encoded.slice(1));
        controller.close();
      },
    });
    await expect(
      readBoundedText(body, 2, new AbortController().signal),
    ).resolves.toBe("é");
    await expect(
      readBoundedText(
        new Response(new Uint8Array([255])).body,
        2,
        new AbortController().signal,
      ),
    ).rejects.toThrow();
  });
});
