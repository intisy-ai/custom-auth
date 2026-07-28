import { openaiTranslator, type IrRequest, type IrResponse, type IrStreamEvent } from "../openai-translator/dist/index.js";

type HandlerCtx = { configDir: string; log: (m: string) => void; model: string };

// Local, dependency-free copy of core-proxy's HandleIrError wire-error shape. The front-door
// recognizes it by its stable `name` marker (duck-typed), never `instanceof`, since this provider
// is esbuild-bundled independently and never builds core-proxy itself.
class HandleIrError extends Error {
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
export { HandleIrError };

export async function handleIr(_ir: IrRequest, _ctx: HandlerCtx): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  throw new HandleIrError({ status: 501, body: "custom-auth handleIr not implemented yet" });
}

export const driver = {
  id: "custom",
  label: "Custom endpoint",
  models: {} as Record<string, unknown>,
  handleIr,
  proxies: true,
};
