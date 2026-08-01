import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { defineConfig } from "../core/dist/index.js";
import { listAccounts, addAccount, removeAccount } from "../core-auth/dist/index.js";
import { HandleIrError } from "./errors.js";

export type Endpoint = { id: string; label: string; baseUrl: string; format: string; models: string[] };

type StoredAccount = { id?: string; enabled?: boolean; refresh?: string; meta?: { endpointId?: string } };

// The account store key an endpoint's API key lives under: its own id, so each endpoint is a
// first-class provider with its own pool. Keys added before the per-endpoint split live under
// the shared "custom" pool tagged with meta.endpointId; keyFor falls back to that, and
// migrateLegacyKeys moves them across.
const LEGACY_POOL = "custom";

export function readEndpoints(): Endpoint[] {
  const cfg = defineConfig("custom-auth", { endpoints: [] }) as { endpoints?: Endpoint[] };
  return Array.isArray(cfg.endpoints) ? cfg.endpoints : [];
}

export function splitModel(model: string): { endpointId: string; upstreamModel: string } {
  const slash = model.indexOf("/");
  if (slash < 0) throw new HandleIrError({ status: 400, body: "custom-auth: model must be <endpointId>/<model>, got: " + model });
  return { endpointId: model.slice(0, slash), upstreamModel: model.slice(slash + 1) };
}

export function keyFor(endpointId: string): string {
  const own = (listAccounts(endpointId, undefined) as StoredAccount[]).find((a) => a.enabled !== false && a.refresh);
  if (own?.refresh) return own.refresh;
  const legacy = (listAccounts(LEGACY_POOL, undefined) as StoredAccount[]).find((a) => a.enabled !== false && a.refresh && a.meta?.endpointId === endpointId);
  if (legacy?.refresh) return legacy.refresh;
  throw new HandleIrError({ status: 401, body: "custom-auth: no API key configured for endpoint " + endpointId });
}

// Resolves the endpoint to serve. The resolved provider id (HandlerCtx.provider) names the
// endpoint directly and the model is the raw upstream model; a namespaced <endpointId>/<model>
// is the back-compat fallback when no provider id is supplied.
export function resolveEndpoint(model: string, provider?: string): { endpointId: string; upstreamModel: string; endpoint: Endpoint; apiKey: string } {
  const endpoints = readEndpoints();
  const byProvider = provider ? endpoints.find((e) => e.id === provider) : undefined;
  const endpointId = byProvider ? byProvider.id : splitModel(model).endpointId;
  const upstreamModel = byProvider ? model : splitModel(model).upstreamModel;
  const endpoint = endpoints.find((e) => e.id === endpointId);
  if (!endpoint) throw new HandleIrError({ status: 400, body: "custom-auth: unknown endpoint " + endpointId });
  return { endpointId, upstreamModel, endpoint, apiKey: keyFor(endpointId) };
}

export function advertisedModels(): string[] {
  return readEndpoints().flatMap((e) => e.models.map((m) => e.id + "/" + m));
}

// Seeds the key into core-auth's account store (accounts.json), never into config/custom-auth.json.
export function saveKey(endpointId: string, key: string): void {
  addAccount(endpointId, { id: endpointId, refresh: key, enabled: true, meta: { endpointId } }, undefined);
}

export type DynamicProviderEntry = { name: string; handler: string; translator: string; accountPool: string };

// One dynamic provider per configured endpoint, in the shape core-loader's readDynamicProviders
// expects. The proxy's provider scan reads these from <repo>/.dynamic-providers.json, so the
// per-endpoint providers become routable the moment endpoints are saved (Cairn reads them live
// through resolveProviders()).
export function buildDynamicManifest(): DynamicProviderEntry[] {
  return readEndpoints().map((e) => ({ name: e.id, handler: "dist/handler.js", translator: "custom", accountPool: e.id }));
}

// Repo root of the deployed clone (parent of dist/, where this module bundles to). The manifest
// sits beside package.json so the loader's per-repo scan finds it.
function defaultRepoDir(): string {
  return fileURLToPath(new URL("..", import.meta.url));
}

// Materializes .dynamic-providers.json from the current endpoints. Best-effort: a write failure
// (read-only checkout, permissions) leaves serving on whatever the last manifest declared.
export function writeDynamicManifest(repoDir: string = defaultRepoDir()): void {
  try {
    writeFileSync(join(repoDir, ".dynamic-providers.json"), JSON.stringify(buildDynamicManifest(), null, 2));
  } catch { /* best-effort */ }
}

// Moves any pre-split keys from the shared "custom" pool into their own per-endpoint pool.
// Idempotent and best-effort: a key already present under its endpoint pool is left in place.
export function migrateLegacyKeys(): void {
  const legacy = listAccounts(LEGACY_POOL, undefined) as StoredAccount[];
  for (const account of legacy) {
    const endpointId = account.meta?.endpointId;
    if (!endpointId || !account.refresh) continue;
    const alreadyMoved = (listAccounts(endpointId, undefined) as StoredAccount[]).some((a) => a.refresh === account.refresh);
    if (!alreadyMoved) addAccount(endpointId, { ...account, id: endpointId }, undefined);
    if (account.id) removeAccount(LEGACY_POOL, account.id, undefined);
  }
}
