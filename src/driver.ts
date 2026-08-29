import type { IrRequest, IrResponse, IrStreamEvent, HandlerCtx } from "@intisy-ai/basekit/ir";
import { loadTranslators } from "./translators.js";
import { getConfigValue, setConfigValue, emitEvent, type ActivitySpec } from "@intisy-ai/basekit";
import { toSettingsGroups, setActivityEmitter, type ProviderSettingsSchema } from "@intisy-ai/basekit/auth";
import { resolveEndpoint, readEndpoints, advertisedModels, splitModel, writeDynamicManifest, keyFor } from "./endpoints.js";
import { HandleIrError, handleIrErrorFromResponse } from "./errors.js";
import { javaHandleEnabled, resolveEndpointViaJava } from "./javaHandle.js";

// endpoints.ts routes its per-endpoint key pools through basekit/auth's AccountManager
// (addAccount/removeAccount), which can emit account activity. dist/driver.js is its own
// esbuild bundle with its own copy of basekit/auth's module-level emitter, separate from
// dist/index.js and dist/handler.js, so it needs the same one-time wiring.
setActivityEmitter((spec: ActivitySpec, source: string) => emitEvent(spec, source));

type HandleIrDeps = { fetch?: typeof fetch };

export { HandleIrError };

// Wire format -> translator, resolved from what is installed rather than a list here: the
// bundled openai translator plus every one in this home's shared store. An endpoint naming a
// format no installed translator speaks fails fast with a 400 rather than mis-encoding.

// The Java-delegated path (java/custom's CustomEndpointResolver + CustomHandleIr, reusing
// endpoint RESOLUTION only): which endpoint and upstream model a request maps to runs through the
// TeaVM-compiled bundle, host I/O (the fetch), the API key lookup and translation stay here.
// Translation cannot be delegated: the format is whichever translator is installed, so binding one
// into the bundle would fix it at build time. Dormant unless HUB_CUSTOM_AUTH_JAVA_HANDLE=1;
// handleIrViaTs below is the unconditional default.
async function handleIrViaJava(ir: IrRequest, ctx: HandlerCtx, doFetch: typeof fetch): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const resolved = await resolveEndpointViaJava(readEndpoints(), ir.model, ctx?.handlerId);
  const translator = (await loadTranslators(ctx.configDir))[resolved.endpoint.format];
  if (!translator) throw new HandleIrError({ status: 400, body: "custom-auth: no translator installed for wire format " + resolved.endpoint.format });

  const apiKey = keyFor(resolved.endpointId);
  const url = resolved.endpoint.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const response = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + apiKey },
    body: await translator.encodeRequest({ ...ir, model: resolved.upstreamModel }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw handleIrErrorFromResponse(response, body);
  }

  if (ir.stream) {
    if (!response.body) throw new HandleIrError({ status: 502, body: "custom-auth: upstream returned no body for a streamed request" });
    return response.body.pipeThrough(await translator.decodeStream());
  }
  return translator.decodeResponse(await response.text()) as Promise<IrResponse>;
}

async function handleIrViaTs(ir: IrRequest, ctx: HandlerCtx, doFetch: typeof fetch): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const { upstreamModel, endpoint, apiKey } = resolveEndpoint(ir.model, ctx?.handlerId);
  const translator = (await loadTranslators(ctx.configDir))[endpoint.format];
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
    throw handleIrErrorFromResponse(response, body);
  }

  if (ir.stream) {
    if (!response.body) throw new HandleIrError({ status: 502, body: "custom-auth: upstream returned no body for a streamed request" });
    return response.body.pipeThrough(await translator.decodeStream());
  }
  return translator.decodeResponse(await response.text());
}

export async function handleIr(ir: IrRequest, ctx: HandlerCtx, deps: HandleIrDeps = {}): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const doFetch = deps.fetch ?? fetch;
  return javaHandleEnabled() ? handleIrViaJava(ir, ctx, doFetch) : handleIrViaTs(ir, ctx, doFetch);
}

// Namespaced advertised models (`<endpointId>/<model>`) as the ProviderModel record
// basekit/auth and the loader expect, labeled with the endpoint's own label for display.
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
// The API key is never part of this: it lives in basekit/auth's account store (see saveKey/keyFor
// in endpoints.ts), reachable only through the Accounts menu, not Settings.
export const CUSTOM_SETTINGS_SCHEMA: ProviderSettingsSchema = [
  { title: "Endpoints", fields: [
    { key: "endpoints", label: "Endpoints (JSON)", type: "multiline", hint: "JSON array of {id,label,baseUrl,format,models[]}. API keys are configured in Accounts, never here." },
  ] },
];

function getSetting(key: string): unknown {
  if (key === "endpoints") return JSON.stringify(getConfigValue("custom-auth", "endpoints") ?? []);
  return getConfigValue("custom-auth", key);
}

function setSetting(key: string, value: unknown): void {
  if (key !== "endpoints") { setConfigValue("custom-auth", key, value); return; }
  if (value === undefined) { setConfigValue("custom-auth", "endpoints", []); }
  else { try { setConfigValue("custom-auth", "endpoints", JSON.parse(String(value))); } catch { return; /* malformed JSON, keep prior value + manifest */ } }
  writeDynamicManifest();
}

export const driver = {
  id: "custom",
  label: "Custom endpoint",
  models: buildModels(),
  handleIr,
  settings: {
    groups: toSettingsGroups(CUSTOM_SETTINGS_SCHEMA),
    get: getSetting,
    set: setSetting,
  },
  proxies: true,
};
