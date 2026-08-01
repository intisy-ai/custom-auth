import { defineProvider } from "../core-auth/dist/index.js";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { maybeRunConfigCli } from "../core/dist/index.js";
import { driver } from "./driver.js";
import { writeDynamicManifest } from "./endpoints.js";

// `node dist/index.js config <list|get|set> …` is the /custom-auth-config CLI;
// handle it and exit before registering the provider.
if (maybeRunConfigCli("custom-auth")) process.exit(0);

// Materialize the per-endpoint provider manifest for the proxy scan, so endpoints configured
// before this build (or on a fresh deploy) become routable without waiting for a re-save. Gated
// to the deployed bundle so unit tests importing this module never write into the source tree.
if (import.meta.url.includes("/dist/")) { try { writeDynamicManifest(); } catch { /* best-effort */ } }

export const CustomProvider = defineProvider(driver as never).opencode;
