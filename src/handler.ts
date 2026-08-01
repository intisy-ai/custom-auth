import { driver } from "./driver.js";

export const handleIr = driver.handleIr;
export const loginFlow = undefined; // no OAuth: keys are entered directly, matching def.hasOAuth below
export const def = { id: driver.id, label: driver.label, models: driver.models, hasOAuth: false };
// Each configured endpoint is a first-class provider; Cairn and the loader enumerate these via
// loadProviderDefs, and the proxy serves them from the materialized .dynamic-providers.json.
export { resolveProviders } from "./driver.js";
