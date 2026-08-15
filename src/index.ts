import { defineProviderPlugin, toCapabilitiesFields, setActivityEmitter } from "@intisy-ai/core-auth";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { defineConfig, defineCapabilities, defineReadme, maybeRunReadmeCli, deployCommands, maybeRunConfigCli, emitEvent } from "@intisy-ai/core";
import { driver, CUSTOM_SETTINGS_SCHEMA } from "./driver.js";
import { writeDynamicManifest } from "./endpoints.js";

// Publish this plugin's lanes on load so endpoints configured before this build become routable
// without waiting for a re-save. Gated to the deployed bundle so a unit test never writes a home.
if (import.meta.url.includes("/dist/")) { try { writeDynamicManifest(); } catch { /* best-effort */ } }

// Best-effort: let core-auth's account activity (added/removed/login/rate_limited/models_refreshed) flow onto the bus.
setActivityEmitter((spec: unknown, source: string) => emitEvent(spec, source));

export const CustomProvider = await defineProviderPlugin({
  name: "custom-auth",
  driver: driver as never, // ProviderDef still declares the legacy `handle` field; this provider is handleIr-only
  core: { defineConfig, defineCapabilities, defineReadme, maybeRunReadmeCli, deployCommands },
  configCliGuard: () => maybeRunConfigCli("custom-auth"),
  defaults: { endpoints: [] },
  capabilities: { fields: toCapabilitiesFields(CUSTOM_SETTINGS_SCHEMA) },
});
