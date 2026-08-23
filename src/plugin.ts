import type { Plugin, PluginContext } from "@intisy-ai/api";
import type { CustomEndpointsCapability, SettingsCapability } from "@intisy-ai/core";
import type { ProviderCapability, ProviderDescriptor, ProviderSupport } from "@intisy-ai/core-auth";
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

// The id the manifest states under services.consumes. Named here rather than imported, because
// importing it would link the library this service exists to keep out of the bundle.
const PROVIDER_SUPPORT = "provider-support";

/**
 * What an in-process host loads: the api plugin this bundle's default export carries.
 *
 * @remarks
 * The provider helpers come from the host rather than from an import, so this bundle carries no
 * copy of the library that implements them. A host offering none cannot run a provider at all, so
 * the throw names the service instead of leaving the capability silently unprovided.
 */
const plugin: Plugin = {
  activate(context: PluginContext) {
    const support = context.services.get(context.service<ProviderSupport>(PROVIDER_SUPPORT));
    if (!support) throw new Error(`this host offers no "${PROVIDER_SUPPORT}" service, so it cannot run a provider`);
    // driver.handleIr takes typed IR params; ProviderDef declares them unknown, so strict mode
    // rejects the assignment without a cast (see index.ts's own driver: driver as never).
    context.provide(context.capability<ProviderCapability>("provider"), support.capability(driver as never, configuredLanes));
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
