// What each of this provider's settings is called and how a surface renders it, beside the values
// the manifest declares. Data the settings capability answers with.
import { toCapabilitiesFields } from "@intisy-ai/basekit/auth";
import { CUSTOM_SETTINGS_SCHEMA } from "./driver.js";

/** This provider's settings, flattened into the fields a capability surface renders. */
export const CUSTOM_SETTINGS = { fields: toCapabilitiesFields(CUSTOM_SETTINGS_SCHEMA) };
