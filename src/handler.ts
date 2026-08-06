import { providerHandlerExports, setActivityEmitter } from "../core-auth/dist/index.js";
// @ts-ignore
import { emitEvent } from "../core/dist/index.js";
import { driver } from "./driver.js";

// This bundle (dist/handler.js) is loaded independently of dist/index.js (the Claude proxy
// daemon and the loader's account-menu, plus each dynamic per-endpoint provider, load it
// directly), so it carries its own copy of core-auth's module-level emitter and needs its own
// one-time wiring.
setActivityEmitter((spec: unknown, source: string) => emitEvent(spec, source));

// driver has no .accounts and no .loginFlow (keys are entered directly, no OAuth), so
// providerHandlerExports naturally omits accounts/menu/menuModel/loginFlow.
export const { handleIr, def } = providerHandlerExports(driver);
// Each configured endpoint is a first-class provider; Cairn and the loader enumerate these via
// loadProviderDefs, and the proxy serves them from the materialized .dynamic-providers.json.
export { resolveProviders } from "./driver.js";
// What a host needs to add an endpoint of its own: store its key, and re-materialise the
// manifest so the new endpoint is routable straight away. A loader has no business holding
// either, so it asks this bundle instead.
export { saveKey, writeDynamicManifest } from "./endpoints.js";
