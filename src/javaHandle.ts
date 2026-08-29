// @ts-nocheck
// The delegation shell for custom-auth's Java-backed endpoint RESOLUTION (java/custom +
// java/teavm-custom), mirroring antigravity-auth's driver/javaHandle.ts split of responsibility:
// the Java side owns which endpoint and upstream model a request maps to, this shell owns host
// I/O (the actual fetch) and the per-endpoint API key lookup (basekit/auth's AccountManager, via
// endpoints.ts).
//
// Translation is deliberately NOT delegated here. This provider speaks whatever wire formats are
// installed, so compiling one vendor's translator into the TeaVM bundle would pick a format at
// build time; the caller translates through the installed translator instead.
//
// Dormant by default: driver.ts only calls into this module when HUB_CUSTOM_AUTH_JAVA_HANDLE=1,
// so the TS resolveEndpoint path stays the live default.

import { lazyModule } from "@intisy-ai/basekit/auth";
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

type Resolution = { endpointId: string; upstreamModel: string; endpoint: { id: string; label: string; baseUrl: string; format: string; models: string[] } };

// Resolves the endpoint and upstream model for `ir.model`/`provider`, via
// CustomEndpointResolver. Throws HandleIrError on a resolve failure, mirroring
// endpoints.ts's resolveEndpoint.
export async function resolveEndpointViaJava(endpoints: unknown[], model: string, provider?: string): Promise<Resolution> {
  const mod = await loadCustomProvider();
  const result = JSON.parse(mod.resolveEndpoint(JSON.stringify(endpoints), model, provider ?? null));
  if (result.error) throw new HandleIrError({ status: result.error.status, body: result.error.body });
  return result;
}
