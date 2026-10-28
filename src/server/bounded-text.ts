/** A body that exceeded its byte limit, distinct from other range errors. */
export class BodyTooLargeError extends RangeError {
  public constructor() {
    super("Body exceeds byte limit.");
    this.name = "BodyTooLargeError";
  }
}

/** Reads a bounded body and cancels promptly on deadline or client disconnect. */
export async function readBoundedText(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  if (body === null) return "";
  const reader = body.getReader();
  const abort = (): void => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      signal.throwIfAborted();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
