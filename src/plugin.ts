import { providerCapability } from "@intisy-ai/core-auth";
import type { Plugin, PluginContext } from "@intisy-ai/api";
import type { CustomEndpointsCapability, SettingsCapability } from "@intisy-ai/core";
import type { ProviderCapability, ProviderDescriptor } from "@intisy-ai/core-auth";
import { driver } from "./driver.js";
import { migrateLegacyKeys, readEndpoints, writeDynamicManifest } from "./endpoints.js";
import { CUSTOM_SETTINGS } from "./settings.js";

/**
 * One lane per endpoint the user configured, resolved when a host asks rather than at activation.
 *
 * @remarks
 * Resolved late because endpoints are user configuration that changes while the plugin is loaded,
 * and a list captured at activation would go stale without anything invalidating it.
 */
function configuredLanes(): ProviderDescriptor[] {
  try { migrateLegacyKeys(); } catch { /* best-effort */ }
  return readEndpoints().map((endpoint) => ({
    id: endpoint.id,
    label: endpoint.label,
    models: Object.fromEntries(endpoint.models.map((model) => [model, { name: model }])),
    hasOAuth: false,
    accountPool: endpoint.id,
    translator: "custom",
  }));
}

/** The endpoints this plugin serves, for a host listing them. */
function customEndpoints(): CustomEndpointsCapability {
  return {
    endpoints: async () => readEndpoints().map((endpoint) => ({
      id: endpoint.id,
      label: endpoint.label,
      baseUrl: endpoint.baseUrl,
    })),
  };
}

/** What an in-process host loads: the api plugin this bundle's default export carries. */
const plugin: Plugin = {
  activate(context: PluginContext) {
    // driver.handleIr takes typed IR params; ProviderDef declares them unknown, so strict mode
    // rejects the assignment without a cast (see index.ts's own driver: driver as never).
    context.provide(context.capability<ProviderCapability>("provider"), providerCapability(driver as never, configuredLanes));
    context.provide(context.capability<CustomEndpointsCapability>("custom-endpoints"), customEndpoints());
    context.provide(context.capability<SettingsCapability>("settings"), {
      schema: () => CUSTOM_SETTINGS,
      run: async (actionId: string) => ({ ok: false, message: `custom-auth declares no action "${actionId}"` }),
    });
    // A throwing activate quarantines the whole plugin, so a cache-write failure must never
    // escape here; index.ts's own republish never runs from the deployed bundle path (its
    // gate checks for "/dist/"), so this is the one place that keeps the manifest current.
    try { writeDynamicManifest(); } catch { /* best-effort */ }
  },
  deactivate() {},
};

export default plugin;
