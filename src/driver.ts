import type { IrRequest, IrResponse, IrStreamEvent, HandlerCtx } from "@intisy-ai/basekit/ir";
import { loadTranslators } from "./translators.js";
import { getConfigValue, setConfigValue, emitEvent, type ActivitySpec } from "@intisy-ai/basekit";
import { toSettingsGroups, setActivityEmitter, type ProviderSettingsSchema } from "@intisy-ai/basekit/auth";
import { resolveEndpoint, readEndpoints, writeDynamicManifest } from "./endpoints.js";
import { displayNames } from "./java.js";
import { HandleIrError, handleIrErrorFromResponse } from "./errors.js";

// endpoints.ts routes its per-endpoint key pools through basekit/auth's AccountManager
// (addAccount/removeAccount), which can emit account activity. dist/driver.js is its own
// esbuild bundle with its own copy of basekit/auth's module-level emitter, separate from
// dist/index.js and dist/handler.js, so it needs the same one-time wiring.
setActivityEmitter((spec: ActivitySpec, source: string) => emitEvent(spec, source));

type HandleIrDeps = { fetch?: typeof fetch };

export { HandleIrError };

/**
 * Serves one request against the endpoint it resolves to.
 *
 * @remarks
 * Which endpoint and upstream model a request maps to is the Java's decision; this owns what needs a
 * host, the API key lookup and the request itself. Translation stays here too, and not by omission:
 * the wire format is whichever translator this home has installed, so compiling one into the Java
 * bundle would fix the format at build time.
 *
 * @param ir - the request, in canonical IR
 * @param ctx - the handler context, whose `handlerId` names the endpoint when a host resolved one
 * @param deps - the fetch to use, for a test that serves its own upstream
 * @returns the upstream answer, decoded back into IR, streamed when the request was
 * @throws HandleIrError on a resolve failure, a missing translator, or a non-2xx upstream outcome
 */
export async function handleIr(
  ir: IrRequest,
  ctx: HandlerCtx,
  deps: HandleIrDeps = {},
): Promise<IrResponse | ReadableStream<IrStreamEvent>> {
  const doFetch = deps.fetch ?? fetch;
  const { upstreamModel, endpoint, apiKey } = resolveEndpoint(ir.model, ctx?.handlerId);
  const translator = (await loadTranslators(ctx.configDir))[endpoint.format];
  if (!translator) throw new HandleIrError({ status: 400, body: "custom-auth: unsupported wire format " + endpoint.format });

  const url = endpoint.baseUrl.replace(/\/$/, "") + "/chat/completions";
  const response = await doFetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: "Bearer " + apiKey },
    body: await translator.encodeRequest({ ...ir, model: upstreamModel }),
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
// basekit/auth and the loader expect, labeled with the endpoint's own label for display.
function buildModels(): Record<string, { name: string }> {
  const out: Record<string, { name: string }> = {};
  for (const [namespaced, name] of Object.entries(displayNames(readEndpoints()))) out[namespaced] = { name };
  return out;
}

/**
 * What this provider can be told, as a settings editor renders it.
 *
 * @remarks
 * Endpoints are edited as a single JSON-array field, because their shape does not fit the flat
 * bool/enum/number/string fields the editor otherwise supports. The API key is never part of this:
 * it lives in basekit/auth's account store, reachable only through the Accounts menu.
 */
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

/** What this provider offers a host: its lanes' models, how to serve one, and what it can be told. */
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
