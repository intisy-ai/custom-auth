// Local, dependency-free copy of core-proxy's HandleIrError wire-error shape. The front-door
// recognizes it by its stable `name` marker (duck-typed), never `instanceof`, since this provider
// is esbuild-bundled independently and never builds core-proxy itself.
export class HandleIrError extends Error {
  status: number;
  headers?: Record<string, string>;
  body: string;
  retryAfterMs?: number;
  constructor(init: { status: number; headers?: Record<string, string>; body: string; retryAfterMs?: number }) {
    super("handleIr transport error: " + init.status);
    this.name = "HandleIrError";
    this.status = init.status;
    this.headers = init.headers;
    this.body = init.body;
    this.retryAfterMs = init.retryAfterMs;
  }
}
