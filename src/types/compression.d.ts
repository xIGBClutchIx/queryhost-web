// Narrow declaration for the subset of `compression` the site server uses.
declare module "compression" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  type NextFunction = (error?: Error) => void;

  interface CompressionOptions {
    readonly filter?: (
      request: IncomingMessage,
      response: ServerResponse,
    ) => boolean;
    readonly threshold?: number;
  }

  interface CompressionMiddleware {
    (
      request: IncomingMessage,
      response: ServerResponse,
      next: NextFunction,
    ): void;
  }

  interface Compression {
    (options?: CompressionOptions): CompressionMiddleware;
    filter(request: IncomingMessage, response: ServerResponse): boolean;
  }

  const compression: Compression;
  export default compression;
}
