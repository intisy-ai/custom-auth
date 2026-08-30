import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getConfigValue, setConfigValue } from "@intisy-ai/basekit";
import { AccountManager, addAccount, removeAccount, getConfigDir, cacheDir } from "@intisy-ai/basekit/auth";
import { HandleIrError } from "./errors.js";
import * as java from "./java.js";
import { supportedFormats } from "./translators.js";

// Re-exported so a host reaches every endpoint rule through one module, the way it already
// does for validation and storage.
export { supportedFormats };

/** A configured endpoint: where to send a request, in what wire format, for which models. */
export type Endpoint = { id: string; label: string; baseUrl: string; format: string; models: string[] };

/**
 * The wire formats this plugin speaks on its own, which is none.
 *
 * @remarks
 * It vendors no translator, so {@link supportedFormats} answers with whatever is installed in the
 * home's shared store. Kept exported, and empty, for hosts that predate the async call: claiming a
 * format no translator provides is how an endpoint came to be accepted and then fail at request time.
 */
export const SUPPORTED_FORMATS: readonly string[] = [];

type StoredAccount = { id?: string; enabled?: boolean; refresh?: string; meta?: { endpointId?: string } };

// The account store key an endpoint's API key lives under: its own id, so each endpoint is a
// first-class provider with its own pool. Keys added before the per-endpoint split live under
// the shared "custom" pool tagged with meta.endpointId; keyFor falls back to that, and
// migrateLegacyKeys moves them across.
const LEGACY_POOL = "custom";

/**
 * The endpoints this home has configured.
 *
 * @remarks
 * `defineConfig` registration happens once, in index.ts's prologue before the config-CLI guard; this
 * only reads what is already registered, so it works standalone from a test that never imports
 * index.ts and re-declares no schema.
 *
 * @returns the configured endpoints, empty when none are
 */
export function readEndpoints(): Endpoint[] {
  const endpoints = getConfigValue("custom-auth", "endpoints");
  return Array.isArray(endpoints) ? (endpoints as Endpoint[]) : [];
}

/**
 * Why an endpoint would not work, applied wherever one is added: the dashboard's editor, a loader's
 * Providers view, or anything added later.
 *
 * @param endpoint - the endpoint being added or replaced
 * @param opts - the endpoints to check for a duplicate against, whether a duplicate is a problem,
 *               and the wire formats a translator is installed for
 * @returns the reason it would not work, or null when it would
 */
export function validateEndpoint(
  endpoint: Partial<Endpoint>,
  opts: { existing?: Endpoint[]; rejectDuplicate?: boolean; formats?: string[] } = {},
): string | null {
  return java.validateEndpoint(
    opts.existing ?? readEndpoints(),
    endpoint,
    opts.rejectDuplicate === true,
    opts.formats ?? SUPPORTED_FORMATS,
  );
}

/**
 * Adds or replaces an endpoint and makes it routable in one step.
 *
 * @remarks
 * A host calls this instead of writing the config itself, so every route in has the same rules and
 * the same follow-through. Whether a format is usable is asked rather than assumed: it is valid when
 * a translator for it is actually installed, which the bundled floor alone cannot answer.
 *
 * @param endpoint - the endpoint to add, or to replace the one sharing its id
 * @param repoDir - accepted for callers that still pass a checkout path; the manifest lives in the home
 */
export async function upsertEndpoint(endpoint: Endpoint, repoDir?: string): Promise<void> {
  const endpoints = readEndpoints();
  const problem = validateEndpoint(endpoint, { existing: endpoints, formats: await supportedFormats(getConfigDir()) });
  if (problem) throw new Error(problem);
  setConfigValue("custom-auth", "endpoints", java.upsertEndpoint(endpoints, endpoint));
  writeDynamicManifest();
}

/**
 * Drops an endpoint, its key pool and its lane together.
 *
 * @param id - the endpoint id to remove
 * @param repoDir - accepted for callers that still pass a checkout path; the manifest lives in the home
 */
export function removeEndpoint(id: string, repoDir?: string): void {
  setConfigValue("custom-auth", "endpoints", java.removeEndpoint(readEndpoints(), id));
  removeAccount(id, id, undefined);
  writeDynamicManifest();
}

/**
 * Each endpoint with whether a key has been entered for it, which is what a host lists.
 *
 * @returns every configured endpoint, each carrying its key state
 */
export function endpointViews(): Array<Endpoint & { hasKey: boolean }> {
  return readEndpoints().map((endpoint) => ({ ...endpoint, hasKey: hasKey(endpoint.id) }));
}

// Reads a pool through basekit/auth's AccountManager (the same shared engine every other
// provider's account pool goes through), instead of a raw store read, so an endpoint's keys
// participate in the same account machinery as any other provider's accounts.
function poolAccounts(providerId: string): StoredAccount[] {
  return new AccountManager(providerId, {}).list() as StoredAccount[];
}

function storedKey(endpointId: string): string | undefined {
  const own = poolAccounts(endpointId).find((a) => a.enabled !== false && a.refresh);
  if (own?.refresh) return own.refresh;
  const legacy = poolAccounts(LEGACY_POOL).find(
    (a) => a.enabled !== false && a.refresh && a.meta?.endpointId === endpointId,
  );
  return legacy?.refresh;
}

function hasKey(endpointId: string): boolean {
  return storedKey(endpointId) !== undefined;
}

/**
 * The API key configured for an endpoint.
 *
 * @param endpointId - the endpoint to look a key up for
 * @returns the key
 * @throws HandleIrError with a 401 when no key has been entered, which is the host's own answer
 */
export function keyFor(endpointId: string): string {
  const key = storedKey(endpointId);
  if (key === undefined) {
    throw new HandleIrError({ status: 401, body: "custom-auth: no API key configured for endpoint " + endpointId });
  }
  return key;
}

/**
 * Resolves the endpoint to serve, and the key to serve it with.
 *
 * @param model - the model the request names
 * @param provider - the resolved provider id, which names an endpoint directly
 * @returns the endpoint, the model to send upstream, and the API key
 * @throws HandleIrError when no configured endpoint answers, or none has a key
 */
export function resolveEndpoint(
  model: string,
  provider?: string,
): { endpointId: string; upstreamModel: string; endpoint: Endpoint; apiKey: string } {
  const resolved = java.resolveEndpoint(readEndpoints(), model, provider);
  return { ...resolved, apiKey: keyFor(resolved.endpointId) };
}

/**
 * Every model the configured endpoints advertise, each namespaced by the endpoint offering it.
 *
 * @returns the namespaced `<endpointId>/<model>` ids
 */
export function advertisedModels(): string[] {
  return Object.keys(java.displayNames(readEndpoints()));
}

/**
 * Seeds a key into basekit/auth's account store, never into `config/custom-auth.json`.
 *
 * @param endpointId - the endpoint the key belongs to
 * @param key - the API key to store
 */
export function saveKey(endpointId: string, key: string): void {
  addAccount(endpointId, { id: endpointId, refresh: key, enabled: true, meta: { endpointId } }, undefined);
}

/** This plugin's id, which is also its clone directory and the key its lanes are filed under. */
const PLUGIN_ID = "custom-auth";

/** One routable lane, in the shape a host's provider scan reads out of the app home. */
export type DynamicProviderEntry = java.ManifestLane;

/**
 * One routable lane per configured endpoint.
 *
 * @returns the lanes, in configuration order
 */
export function buildDynamicManifest(): DynamicProviderEntry[] {
  return java.dynamicManifest(readEndpoints());
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

/**
 * Moves any pre-split keys from the shared "custom" pool into their own per-endpoint pool.
 *
 * @remarks
 * Idempotent and best-effort: a key already present under its endpoint pool is left in place.
 */
export function migrateLegacyKeys(): void {
  const legacy = poolAccounts(LEGACY_POOL);
  for (const account of legacy) {
    const endpointId = account.meta?.endpointId;
    const refresh = account.refresh;
    if (!endpointId || !refresh) continue;
    const alreadyMoved = poolAccounts(endpointId).some((a) => a.refresh === refresh);
    if (!alreadyMoved) addAccount(endpointId, { ...account, id: endpointId, refresh }, undefined);
    if (account.id) removeAccount(LEGACY_POOL, account.id, undefined);
  }
}
