import { openaiTranslator, type IrRequest, type IrResponse, type IrStreamEvent } from "../openai-translator/dist/index.js";
import { resolveEndpoint } from "./endpoints.js";

type HandlerCtx = { configDir: string; log: (m: string) => void; model: string };
type HandleIrDeps = { fetch?: typeof fetch };

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

// Wire format -> translator. Only "openai" is wired up so far; other formats fail
// fast with a 400 rather than silently mis-encoding.
const TRANSLATORS: Record<string, typeof openaiTranslator> = { openai: openaiTranslator };

export async function handleIr(ir: IrRequest, _ctx: HandlerCtx, deps: HandleIrDeps = {}): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const doFetch = deps.fetch ?? fetch;
  const { upstreamModel, endpoint, apiKey } = resolveEndpoint(ir.model);
  const translator = TRANSLATORS[endpoint.format];
  if (!translator) throw new HandleIrError({ status: 400, body: "custom-auth: unsupported wire format " + endpoint.format });

  const upstreamIr = { ...ir, model: upstreamModel };
  const wireBody = await translator.encodeRequest(upstreamIr);
  const url = endpoint.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const response = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + apiKey },
    body: wireBody,
  });

  if (!response.ok) {
    const body = await response.text();
    const retryAfter = response.headers.get("retry-after");
    throw new HandleIrError({
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      body,
      retryAfterMs: retryAfter ? Number(retryAfter) * 1000 : undefined,
    });
  }

  if (ir.stream) {
    throw new HandleIrError({ status: 501, body: "custom-auth streaming not implemented yet" });
  }
  return translator.decodeResponse(await response.text());
}

export const driver = {
  id: "custom",
  label: "Custom endpoint",
  models: {} as Record<string, unknown>,
  handleIr,
  proxies: true,
};
