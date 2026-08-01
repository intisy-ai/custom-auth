import { openaiTranslator, type IrRequest, type IrResponse, type IrStreamEvent } from "../openai-translator/dist/index.js";
// @ts-ignore
import { getConfigValue, setConfigValue } from "../core/dist/index.js";
import { toSettingsGroups, type ProviderSettingsSchema } from "../core-auth/dist/index.js";
import { resolveEndpoint, readEndpoints, advertisedModels, splitModel, writeDynamicManifest, migrateLegacyKeys, accountsFor } from "./endpoints.js";
import { HandleIrError, handleIrErrorFromResponse } from "./errors.js";

type HandlerCtx = { configDir: string; log: (m: string) => void; model: string; provider?: string };
type HandleIrDeps = { fetch?: typeof fetch };

export { HandleIrError };

// Wire format -> translator. Only "openai" is wired up so far; other formats fail
// fast with a 400 rather than silently mis-encoding.
const TRANSLATORS: Record<string, typeof openaiTranslator> = { openai: openaiTranslator };

export async function handleIr(ir: IrRequest, ctx: HandlerCtx, deps: HandleIrDeps = {}): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const doFetch = deps.fetch ?? fetch;
  const { upstreamModel, endpoint, apiKey } = resolveEndpoint(ir.model, ctx?.provider);
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
    throw handleIrErrorFromResponse(response, body);
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

// One first-class provider per configured endpoint (its own id, models, and account pool), so
// each endpoint appears as a real provider rather than a namespaced model on a single "custom"
// provider. Returns [] when no endpoints are configured. Never throws: enumeration must stay
// cheap and safe (a config read + a best-effort key migration).
export function resolveProviders(): Array<{ id: string; label: string; models: Record<string, { name: string }>; hasOAuth: false; accountPool: string; accounts: ReturnType<typeof accountsFor> }> {
  try { migrateLegacyKeys(); } catch { /* best-effort */ }
  return readEndpoints().map((e) => ({
    id: e.id,
    label: e.label,
    models: Object.fromEntries(e.models.map((m) => [m, { name: m }])),
    hasOAuth: false,
    accountPool: e.id,
    accounts: accountsFor(e.id),
  }));
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
