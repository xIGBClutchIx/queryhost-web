// The build inlines each font, so the server bundle needs no files beside it.
// This module is imported only when the first preview is drawn.
import geistMedium from "./Geist-Medium.ttf?inline";
import geistSemiBold from "./Geist-SemiBold.ttf?inline";
import geistMonoMedium from "./GeistMono-Medium.ttf?inline";

function bytes(dataUrl: string): Uint8Array {
  return new Uint8Array(
    Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"),
  );
}

/** Geist (Medium, SemiBold) and Geist Mono (Medium), under the SIL OFL 1.1. */
export const PREVIEW_FONTS: readonly Uint8Array[] = [
  bytes(geistMedium),
  bytes(geistSemiBold),
  bytes(geistMonoMedium),
];
