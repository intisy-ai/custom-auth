import { providerHandlerExports, setActivityEmitter } from "@intisy-ai/core-auth";
import { emitEvent, type ActivitySpec } from "@intisy-ai/core";
import { driver } from "./driver.js";

// This bundle (dist/handler.js) is loaded independently of dist/index.js (the Claude proxy
// daemon and the loader's account-menu, plus each dynamic per-endpoint provider, load it
// directly), so it carries its own copy of core-auth's module-level emitter and needs its own
// one-time wiring.
setActivityEmitter((spec: ActivitySpec, source: string) => emitEvent(spec, source));

// driver has no .accounts and no .loginFlow (keys are entered directly, no OAuth), so
// providerHandlerExports naturally omits accounts/menu/menuModel/loginFlow.
export const { handleIr } = providerHandlerExports(driver);
// What a host needs to add an endpoint of its own: store its key, and re-materialise the
// manifest so the new endpoint is routable straight away. A loader has no business holding
// either, so it asks this bundle instead.
// Everything a host needs to manage endpoints, so neither the dashboard nor a loader keeps a
// second copy of the rules: what formats exist, whether an endpoint would work, adding and
// removing one (each re-materialising the manifest that makes it routable), listing them with
// their key state, and storing a key.
export {
  SUPPORTED_FORMATS,
  supportedFormats,
  validateEndpoint,
  upsertEndpoint,
  removeEndpoint,
  endpointViews,
  readEndpoints,
  saveKey,
  writeDynamicManifest,
} from "./endpoints.js";
