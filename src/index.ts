import { defineProviderPlugin, toCapabilitiesFields } from "../core-auth/dist/index.js";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { defineConfig, defineCapabilities, defineReadme, maybeRunReadmeCli, deployCommands, maybeRunConfigCli } from "../core/dist/index.js";
import { driver, CUSTOM_SETTINGS_SCHEMA } from "./driver.js";
import { writeDynamicManifest } from "./endpoints.js";

// Materialize the per-endpoint provider manifest for the proxy scan, so endpoints configured
// before this build (or on a fresh deploy) become routable without waiting for a re-save. Gated
// to the deployed bundle so unit tests importing this module never write into the source tree.
if (import.meta.url.includes("/dist/")) { try { writeDynamicManifest(); } catch { /* best-effort */ } }

export const CustomProvider = await defineProviderPlugin({
  name: "custom-auth",
  driver: driver as never, // ProviderDef still declares the legacy `handle` field; this provider is handleIr-only
  core: { defineConfig, defineCapabilities, defineReadme, maybeRunReadmeCli, deployCommands },
  configCliGuard: () => maybeRunConfigCli("custom-auth"),
  defaults: { endpoints: [] },
  capabilities: { fields: toCapabilitiesFields(CUSTOM_SETTINGS_SCHEMA) },
});
