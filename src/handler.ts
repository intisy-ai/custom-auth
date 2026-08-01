import { providerHandlerExports } from "../core-auth/dist/index.js";
import { driver } from "./driver.js";

// driver has no .accounts and no .loginFlow (keys are entered directly, no OAuth), so
// providerHandlerExports naturally omits accounts/menu/menuModel/loginFlow.
export const { handleIr, def } = providerHandlerExports(driver);
// Each configured endpoint is a first-class provider; Cairn and the loader enumerate these via
// loadProviderDefs, and the proxy serves them from the materialized .dynamic-providers.json.
export { resolveProviders } from "./driver.js";
