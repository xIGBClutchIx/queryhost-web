import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

import { initWasm, Resvg } from "@resvg/resvg-wasm";
import type { GameId } from "queryhost";

import {
  minecraftEdition,
  stripMinecraftFormatting,
} from "../lib/minecraft-text.js";
import type {
  PlaygroundGameDefinition,
  PlaygroundProxyErrorResponse,
  PlaygroundQueryInput,
} from "../lib/playground-contracts.js";
import type { BadgeService } from "./badge.js";
import { parseImageRequest } from "./badge.js";
import type { BadgeState } from "./badge-svg.js";
import { ProxyGate, type ProxyGatePolicy } from "./proxy-gate.js";
import { integerEnvironment, PublicQueryInputError } from "./public-query.js";
import {
  PREVIEW_WIDTH,
  renderPreviewSvg,
  type PreviewCard,
} from "./preview-svg.js";

/** Turns a preview card into PNG bytes. */
export type PreviewRasterizer = (svg: string) => Promise<PngBytes>;

/** PNG bytes backed by a plain ArrayBuffer, as a response body requires. */
export type PngBytes = Uint8Array<ArrayBuffer>;

export interface PreviewDependencies {
  readonly badges: BadgeService;
  readonly games: readonly PlaygroundGameDefinition[];
  /** Bounds how many cache-missing images are drawn per window. */
  readonly gate: ProxyGate;
  /** How many rendered images are kept. */
  readonly maxEntries: number;
  readonly now: () => number;
  readonly rasterize: PreviewRasterizer;
}

const PREVIEW_ROUTE_ALLOW = "GET, HEAD, OPTIONS";
const PREVIEW_CALLER = "preview";
/** The static site preview, served when drawing a new image is over budget. */
const FALLBACK_IMAGE = "/share.png?v=2";

/** Reads the global drawing budget for result previews. */
export function loadPreviewGatePolicy(
  environment: NodeJS.ProcessEnv = process.env,
): ProxyGatePolicy {
  const maxStartsPerWindow = integerEnvironment(
    environment,
    "QUERYHOST_WEB_PREVIEW_MAX_RENDERS_PER_WINDOW",
    120,
    1,
    10_000,
  );
  return {
    // Drawing is synchronous, so at most one is ever active.
    maxActive: 1,
    maxStartsPerCaller: maxStartsPerWindow,
    maxStartsPerWindow,
    maxTrackedCallers: 1,
    windowMs: 60_000,
  };
}

let rasterizerReady: Promise<void> | undefined;
let fontBuffers: Promise<readonly Uint8Array[]> | undefined;

// The fonts and the WebAssembly module load once, on the first preview drawn.
function loadFonts(): Promise<readonly Uint8Array[]> {
  fontBuffers ??= import("./preview-fonts/fonts.js").then(
    ({ PREVIEW_FONTS }) => PREVIEW_FONTS,
  );
  return fontBuffers;
}

/** Rasterizes preview SVGs with resvg and the vendored Geist fonts. */
export const rasterizePreview: PreviewRasterizer = async (svg) => {
  rasterizerReady ??= readFile(
    createRequire(import.meta.url).resolve("@resvg/resvg-wasm/index_bg.wasm"),
  ).then((wasm) => initWasm(wasm));
  await rasterizerReady;
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: PREVIEW_WIDTH },
    font: {
      defaultFontFamily: "Geist",
      fontBuffers: [...(await loadFonts())],
      monospaceFamily: "Geist Mono",
      sansSerifFamily: "Geist",
    },
  });
  try {
    const image = resvg.render();
    try {
      return new Uint8Array(image.asPng());
    } finally {
      image.free();
    }
  } finally {
    resvg.free();
  }
};

/** The name and address a result page and its preview both show. */
export function previewAddress(input: PlaygroundQueryInput): string {
  const host = input.host.includes(":") ? `[${input.host}]` : input.host;
  return input.port === undefined ? host : `${host}:${input.port}`;
}

function serverName(game: GameId, state: BadgeState): string | undefined {
  if (state.kind !== "online" || state.name === undefined) {
    return undefined;
  }
  const edition = minecraftEdition(game);
  const name =
    edition === undefined
      ? state.name
      : stripMinecraftFormatting(state.name, edition);
  return name.trim().length === 0 ? undefined : name;
}

/** The card a result's preview shows, from its input and resolved state. */
export function previewCard(
  input: PlaygroundQueryInput,
  game: PlaygroundGameDefinition | undefined,
  state: BadgeState,
): PreviewCard {
  const name = serverName(input.game, state);
  return {
    address: previewAddress(input),
    gameName: game?.name ?? input.game,
    state,
    ...(name === undefined ? {} : { serverName: name }),
  };
}

interface PreviewImage {
  readonly maxAgeSeconds: number;
  /** PNG bytes, or undefined when drawing is over budget. */
  readonly png?: PngBytes;
}

/**
 * Draws result previews from badge state, so a page's preview and its badge
 * share one cached query. Drawn images are kept in a bounded, process-local
 * cache keyed by what they show; new drawings share a global budget.
 */
export class PreviewService {
  readonly #dependencies: PreviewDependencies;
  /** Rendered PNGs keyed by a digest of the SVG they were drawn from. */
  readonly #images = new Map<string, PngBytes>();

  public constructor(dependencies: PreviewDependencies) {
    this.#dependencies = dependencies;
  }

  public get size(): number {
    return this.#images.size;
  }

  public async image(input: PlaygroundQueryInput): Promise<PreviewImage> {
    const game = this.#dependencies.games.find(
      (definition) => definition.id === input.game,
    );
    // The result page fills in the default port, so its preview does too.
    const query: PlaygroundQueryInput =
      input.port === undefined &&
      game?.defaultPort !== undefined &&
      input.game !== "a2s"
        ? { ...input, port: game.defaultPort }
        : input;
    const { maxAgeSeconds, state } =
      await this.#dependencies.badges.resolve(query);
    const card = previewCard(input, game, state);
    const svg = renderPreviewSvg(card);
    const key = createHash("sha256").update(svg).digest("base64");
    const cached = this.#images.get(key);
    if (cached !== undefined) {
      this.#store(key, cached);
      return { maxAgeSeconds, png: cached };
    }
    const admission = this.#dependencies.gate.admit(
      PREVIEW_CALLER,
      this.#dependencies.now(),
    );
    if (!admission.accepted) {
      return { maxAgeSeconds: 0 };
    }
    try {
      const png = await this.#dependencies.rasterize(svg);
      this.#store(key, png);
      return { maxAgeSeconds, png };
    } finally {
      admission.release();
    }
  }

  #store(key: string, png: PngBytes): void {
    // Map order doubles as recency: re-inserting moves the key to the end.
    this.#images.delete(key);
    this.#images.set(key, png);
    while (this.#images.size > this.#dependencies.maxEntries) {
      const oldest = this.#images.keys().next();
      if (oldest.done === true) {
        break;
      }
      this.#images.delete(oldest.value);
    }
  }
}

function previewRouteError(
  status: 404 | 405,
  code: "METHOD_NOT_ALLOWED" | "NOT_FOUND",
  message: string,
): Response {
  const body: PlaygroundProxyErrorResponse = { error: { code, message } };
  return new Response(JSON.stringify(body), {
    headers: {
      Allow: PREVIEW_ROUTE_ALLOW,
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    },
    status,
  });
}

/** Handles `/preview/{game}/{host}[:{port}].png`, the result page's link preview. */
export async function handlePreviewRequest(
  request: Request,
  params: { readonly game: string; readonly file: string },
  service: PreviewService,
): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: { Allow: PREVIEW_ROUTE_ALLOW, "Cache-Control": "no-store" },
      status: 204,
    });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return previewRouteError(
      405,
      "METHOD_NOT_ALLOWED",
      `This route allows ${PREVIEW_ROUTE_ALLOW}.`,
    );
  }

  let input: PlaygroundQueryInput | undefined;
  try {
    input = parseImageRequest(
      params.game,
      params.file,
      ".png",
      new URL(request.url).searchParams,
    );
  } catch (error) {
    if (!(error instanceof PublicQueryInputError)) throw error;
  }
  if (input === undefined) {
    return previewRouteError(
      404,
      "NOT_FOUND",
      "Preview paths name a valid server, as in /preview/{game}/{host}.png.",
    );
  }

  const { maxAgeSeconds, png } = await service.image(input);
  if (png === undefined) {
    return new Response(null, {
      headers: { "Cache-Control": "no-store", Location: FALLBACK_IMAGE },
      status: 302,
    });
  }
  return new Response(request.method === "HEAD" ? null : png, {
    headers: {
      "Cache-Control":
        maxAgeSeconds > 0 ? `public, max-age=${maxAgeSeconds}` : "no-cache",
      "Content-Length": String(png.byteLength),
      "Content-Type": "image/png",
    },
    status: 200,
  });
}
