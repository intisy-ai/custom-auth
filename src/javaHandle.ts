// @ts-nocheck
// The delegation shell for custom-auth's Java-backed endpoint resolve + OpenAI encode/decode
// (java/custom + java/teavm-custom), mirroring antigravity-auth's driver/javaHandle.ts split of
// responsibility: the Java side owns the resolve/translate decision (CustomEndpointResolver +
// openai-translator's Java, reused not re-implemented), this shell owns host I/O (the actual
// fetch) and the per-endpoint API key lookup (core-auth's AccountManager, via endpoints.ts).
//
// Dormant by default: driver.ts only calls into this module when HUB_CUSTOM_AUTH_JAVA_HANDLE=1,
// so the existing TS resolveEndpoint + translator.encodeRequest/decodeResponse path stays the live
// default. Streaming responses are not routed through this module yet (translator.decodeStream()
// already reaches openai-translator's own Java independently); only the non-streaming request
// prepare + response decode are delegated here.

import { lazyModule } from "../core-auth/dist/index.js";
import { HandleIrError } from "./errors.js";

export function javaHandleEnabled() {
  return process.env.HUB_CUSTOM_AUTH_JAVA_HANDLE === "1";
}

// Lazily-memoized dynamic import of the TeaVM ESM, staged to src/generated/ by core/teavm-build.mjs
// at build time and bundled (deferred) by esbuild.
const customModule = lazyModule(() => import("./generated/custom-provider.teavm.js"));
export function loadCustomProvider() {
  return customModule.load();
}

type PreparedRequest = { endpointId: string; endpoint: { id: string; label: string; baseUrl: string; format: string; models: string[] }; wireBody: string };

// Resolves the endpoint for `ir.model`/`provider` and encodes `ir` (model rewritten to the
// endpoint's upstream model) to the endpoint's wire format, via CustomHandleIr.prepareRequest ->
// openai-translator's Java. Throws HandleIrError on a resolve failure or an unsupported format,
// mirroring endpoints.ts's resolveEndpoint + driver.ts's format check.
export async function prepareRequestViaJava(endpoints: unknown[], ir: unknown, provider?: string): Promise<PreparedRequest> {
  const mod = await loadCustomProvider();
  const resultJson = mod.prepareRequest(JSON.stringify(endpoints), JSON.stringify(ir), provider ?? null);
  const result = JSON.parse(resultJson);
  if (result.error) throw new HandleIrError({ status: result.error.status, body: result.error.body });
  return result;
}

// Decodes a 2xx upstream OpenAI-format response back to IR, via CustomHandleIr.decodeResponse.
export async function decodeResponseViaJava(wireResponseJson: string): Promise<unknown> {
  const mod = await loadCustomProvider();
  return JSON.parse(mod.decodeResponse(wireResponseJson));
}
