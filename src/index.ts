import { defineProviderPlugin, setActivityEmitter } from "@intisy-ai/core-auth";
import { emitEvent, type ActivitySpec } from "@intisy-ai/core";
import { driver } from "./driver.js";
import { writeDynamicManifest } from "./endpoints.js";

// Publish this plugin's lanes on load so endpoints configured before this build become routable
// without waiting for a re-save. Gated to the deployed bundle so a unit test never writes a home.
if (import.meta.url.includes("/dist/")) { try { writeDynamicManifest(); } catch { /* best-effort */ } }

// Best-effort: let core-auth's account activity (added/removed/login/rate_limited/models_refreshed) flow onto the bus.
setActivityEmitter((spec: ActivitySpec, source: string) => emitEvent(spec, source));

export const CustomProvider = await defineProviderPlugin({
  name: "custom-auth",
  driver: driver as never, // ProviderDef still declares the legacy `handle` field; this provider is handleIr-only
});

// CustomProvider stays exported too: OpenCode invokes every exported function, while an api host reads the default.
export { default } from "./plugin.js";
