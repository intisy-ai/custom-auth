import { defineProvider } from "../core-auth/dist/index.js";
// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { maybeRunConfigCli } from "../core/dist/index.js";
import { driver } from "./driver.js";

// `node dist/index.js config <list|get|set> …` is the /custom-auth-config CLI;
// handle it and exit before registering the provider.
if (maybeRunConfigCli("custom-auth")) process.exit(0);

export const CustomProvider = defineProvider(driver as never).opencode;
