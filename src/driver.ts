import { openaiTranslator, type IrRequest, type IrResponse, type IrStreamEvent } from "../openai-translator/dist/index.js";
// @ts-ignore
import { getConfigValue, setConfigValue } from "../core/dist/index.js";
import { resolveEndpoint, readEndpoints, advertisedModels, splitModel } from "./endpoints.js";

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
    if (!response.body) throw new HandleIrError({ status: 502, body: "custom-auth: upstream returned no body for a streamed request" });
    return response.body.pipeThrough(await translator.decodeStream());
  }
  return translator.decodeResponse(await response.text());
}

// Namespaced advertised models (`<endpointId>/<model>`) as the ProviderModel record
// core-auth/the loader expect, labeled with the endpoint's own label for display.
function buildModels(): Record<string, { name: string }> {
  const labelById = new Map(readEndpoints().map((e) => [e.id, e.label]));
  const out: Record<string, { name: string }> = {};
  for (const namespaced of advertisedModels()) {
    const { endpointId, upstreamModel } = splitModel(namespaced);
    out[namespaced] = { name: (labelById.get(endpointId) ?? endpointId) + " / " + upstreamModel };
  }
  return out;
}

// Endpoints are edited as a single JSON-array field: their shape (baseUrl/format/models[])
// doesn't fit the flat bool/enum/number/string fields the settings editor otherwise supports.
// The API key is never part of this: it lives in core-auth's account store (see saveKey/keyFor
// in endpoints.ts), reachable only through the Accounts menu, not Settings.
function getSetting(key: string): unknown {
  if (key === "endpoints") return JSON.stringify(getConfigValue("custom-auth", "endpoints") ?? []);
  return getConfigValue("custom-auth", key);
}

function setSetting(key: string, value: unknown): void {
  if (key !== "endpoints") { setConfigValue("custom-auth", key, value); return; }
  if (value === undefined) { setConfigValue("custom-auth", "endpoints", []); return; }
  try { setConfigValue("custom-auth", "endpoints", JSON.parse(String(value))); } catch { /* ignore malformed JSON, keep prior value */ }
}

export const driver = {
  id: "custom",
  label: "Custom endpoint",
  models: buildModels(),
  handleIr,
  settings: {
    groups: [
      { title: "Endpoints", fields: [
        { key: "endpoints", label: "Endpoints (JSON)", type: "string", hint: "JSON array of {id,label,baseUrl,format,models[]}. API keys are configured in Accounts, never here." },
      ] },
    ],
    get: getSetting,
    set: setSetting,
  },
  proxies: true,
};
