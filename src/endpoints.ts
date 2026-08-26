import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { getConfigValue, setConfigValue } from "@intisy-ai/core";
import { AccountManager, addAccount, removeAccount, getConfigDir, cacheDir } from "@intisy-ai/core-auth";
import { HandleIrError } from "./errors.js";
import { supportedFormats } from "./translators.js";

// Re-exported so a host reaches every endpoint rule through one module, the way it already
// does for validation and storage.
export { supportedFormats };

export type Endpoint = { id: string; label: string; baseUrl: string; format: string; models: string[] };

// This plugin vendors no translator, so it speaks nothing on its own: supportedFormats()
// answers with whatever is installed in the home's shared store. Kept exported, and empty,
// for hosts that predate the async call, since claiming a format no translator provides is
// how an endpoint came to be accepted and then fail at request time.
export const SUPPORTED_FORMATS: readonly string[] = [];

const ID_PATTERN = /^[A-Za-z0-9._-]+$/;

type StoredAccount = { id?: string; enabled?: boolean; refresh?: string; meta?: { endpointId?: string } };

// The account store key an endpoint's API key lives under: its own id, so each endpoint is a
// first-class provider with its own pool. Keys added before the per-endpoint split live under
// the shared "custom" pool tagged with meta.endpointId; keyFor falls back to that, and
// migrateLegacyKeys moves them across.
const LEGACY_POOL = "custom";

// defineConfig registration happens once, in index.ts's prologue (before the config-CLI guard);
// this only reads the already-registered config, so it works standalone (e.g. from tests that
// never import index.ts) and doesn't re-declare the schema on every call.
export function readEndpoints(): Endpoint[] {
  const endpoints = getConfigValue("custom-auth", "endpoints");
  return Array.isArray(endpoints) ? (endpoints as Endpoint[]) : [];
}

// The one rule set for what makes an endpoint usable, applied wherever an endpoint is added:
// the dashboard's editor, a loader's Providers view, or anything added later. Returns the
// reason it would not work, or null.
export function validateEndpoint(endpoint: Partial<Endpoint>, opts: { existing?: Endpoint[]; rejectDuplicate?: boolean; formats?: string[] } = {}): string | null {
  const id = (endpoint.id || "").trim();
  if (!id) return "endpoint id is required";
  if (!ID_PATTERN.test(id)) return "endpoint id may only use letters, numbers, dot, dash and underscore";
  if (opts.rejectDuplicate && (opts.existing ?? readEndpoints()).some((e) => e.id === id)) {
    return `there is already an endpoint called ${id}`;
  }
  if (!(endpoint.label || "").trim()) return "label is required";
  const baseUrl = (endpoint.baseUrl || "").trim();
  if (!baseUrl) return "base URL is required";
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "base URL must be http or https";
  } catch {
    return "base URL is not a valid URL";
  }
  const allowed = opts.formats ?? (SUPPORTED_FORMATS as readonly string[]);
  if (!allowed.includes(endpoint.format || "")) return "unsupported wire format: " + endpoint.format;
  // An endpoint with no models advertises nothing, so it is a provider that can never serve.
  if (!Array.isArray(endpoint.models) || endpoint.models.length === 0) return "at least one model id is required";
  return null;
}

// Adds or replaces an endpoint and makes it routable in one step: validate, store, then
// re-materialise the manifest the provider scan reads. A host calls this instead of writing
// the config itself, so every route in has the same rules and the same follow-through.
/** @param repoDir - accepted for callers that still pass a checkout path; the manifest now lives in the home. */
export async function upsertEndpoint(endpoint: Endpoint, repoDir?: string): Promise<void> {
  const endpoints = readEndpoints();
  // Asked rather than assumed: a format is valid when a translator for it is actually
  // installed, which the bundled floor alone cannot answer.
  const problem = validateEndpoint(endpoint, { existing: endpoints, formats: await supportedFormats(getConfigDir()) });
  if (problem) throw new Error(problem);
  const index = endpoints.findIndex((e) => e.id === endpoint.id);
  const next = endpoints.slice();
  if (index >= 0) next[index] = endpoint;
  else next.push(endpoint);
  setConfigValue("custom-auth", "endpoints", next);
  writeDynamicManifest();
}

/** @param repoDir - accepted for callers that still pass a checkout path; the manifest now lives in the home. */
export function removeEndpoint(id: string, repoDir?: string): void {
  setConfigValue("custom-auth", "endpoints", readEndpoints().filter((e) => e.id !== id));
  removeAccount(id, id, undefined);
  writeDynamicManifest();
}

// Each endpoint with whether a key has been entered for it, which is what a host lists.
export function endpointViews(): Array<Endpoint & { hasKey: boolean }> {
  return readEndpoints().map((e) => ({ ...e, hasKey: !!keyFor(e.id) }));
}

// Reads a pool through core-auth's AccountManager (the same shared engine every other
// provider's account pool goes through), instead of a raw store read, so an endpoint's keys
// participate in the same account machinery as any other provider's accounts.
function poolAccounts(providerId: string): StoredAccount[] {
  return new AccountManager(providerId, {}).list() as StoredAccount[];
}

export function splitModel(model: string): { endpointId: string; upstreamModel: string } {
  const slash = model.indexOf("/");
  if (slash < 0) throw new HandleIrError({ status: 400, body: "custom-auth: model must be <endpointId>/<model>, got: " + model });
  return { endpointId: model.slice(0, slash), upstreamModel: model.slice(slash + 1) };
}

export function keyFor(endpointId: string): string {
  const own = poolAccounts(endpointId).find((a) => a.enabled !== false && a.refresh);
  if (own?.refresh) return own.refresh;
  const legacy = poolAccounts(LEGACY_POOL).find((a) => a.enabled !== false && a.refresh && a.meta?.endpointId === endpointId);
  if (legacy?.refresh) return legacy.refresh;
  throw new HandleIrError({ status: 401, body: "custom-auth: no API key configured for endpoint " + endpointId });
}

// Resolves the endpoint to serve. The resolved provider id (HandlerCtx.handlerId) names the
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

/** This plugin's id, which is also its clone directory and the key its lanes are filed under. */
const PLUGIN_ID = "custom-auth";

export type DynamicProviderEntry = { name: string; repo: string; handler: string; translator: string; accountPool: string };

/** One routable lane per configured endpoint, in the shape a host's provider scan reads. */
export function buildDynamicManifest(): DynamicProviderEntry[] {
  return readEndpoints().map((endpoint) => ({
    name: endpoint.id,
    repo: PLUGIN_ID,
    handler: "dist/handler.js",
    translator: "custom",
    accountPool: endpoint.id,
  }));
}

function dynamicManifestPath(): string {
  return join(cacheDir(), "dynamic-providers.json");
}

function readHomeManifest(at: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(at, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Publishes this plugin's lanes into the app home, replacing only its own key.
 *
 * @remarks
 * The home rather than the checkout, because an endpoint the user configured is state of that home
 * and a checkout is replaced on every update. Best-effort: a write failure leaves serving on
 * whatever the last published manifest declared. An empty list is written rather than the key
 * removed, so removing the last endpoint is a published fact rather than an absence a reader would
 * have to guess at.
 */
export function writeDynamicManifest(): void {
  try {
    const at = dynamicManifestPath();
    const all = readHomeManifest(at);
    all[PLUGIN_ID] = buildDynamicManifest();
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(at, JSON.stringify(all, null, 2));
  } catch { /* best-effort */ }
}

// Moves any pre-split keys from the shared "custom" pool into their own per-endpoint pool.
// Idempotent and best-effort: a key already present under its endpoint pool is left in place.
export function migrateLegacyKeys(): void {
  const legacy = poolAccounts(LEGACY_POOL);
  for (const account of legacy) {
    const endpointId = account.meta?.endpointId;
    if (!endpointId || !account.refresh) continue;
    const alreadyMoved = poolAccounts(endpointId).some((a) => a.refresh === account.refresh);
    if (!alreadyMoved) addAccount(endpointId, { ...account, id: endpointId }, undefined);
    if (account.id) removeAccount(LEGACY_POOL, account.id, undefined);
  }
}
