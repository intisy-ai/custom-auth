// Generated from Java sources. Do not edit.

/**
 * Every advertised model with the name a surface shows for it.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @returns namespaced model id to display name, as a JSON object
 */
export declare function displayNames(endpointsJson: string): string;
/**
 * The lanes a host's provider scan reads out of the app home's dynamic manifest.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @returns one entry per endpoint, as a JSON array
 */
export declare function dynamicManifest(endpointsJson: string): string;
/**
 * The lanes an in-process host asks the provider capability for.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @returns one provider descriptor per endpoint, as a JSON array
 */
export declare function providerDescriptors(endpointsJson: string): string;
/**
 * The endpoint list without the one named.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @param id - the endpoint id to drop
 * @returns the resulting endpoint array as JSON
 */
export declare function removeEndpoint(endpointsJson: string, id: string): string;
/**
 * Resolves the endpoint and upstream model a request maps to.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @param model - the model the request names
 * @param provider - the resolved provider id naming an endpoint directly, or null to fall back to
 * the namespaced form
 * @returns `{endpointId, upstreamModel, endpoint`} as JSON, or
 * `{error:{status,body`}} when no configured endpoint answers
 */
export declare function resolveEndpoint(endpointsJson: string, model: string, provider: string | null): string;
/**
 * The endpoint list with one added or replaced, matched by id.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @param endpointJson - the endpoint to add or replace with, as its JSON object
 * @returns the resulting endpoint array as JSON
 */
export declare function upsertEndpoint(endpointsJson: string, endpointJson: string): string;
/**
 * Why an endpoint would not work.
 *
 * @param endpointsJson - the configured endpoints, as their JSON array
 * @param endpointJson - the endpoint being added or replaced, as its JSON object
 * @param rejectDuplicate - whether an id already configured is a problem
 * @param formatsJson - the wire formats a translator is installed for, as a JSON array
 * @returns `{problem`} as JSON, the problem being null when the endpoint would work
 */
export declare function validateEndpoint(endpointsJson: string, endpointJson: string, rejectDuplicate: boolean, formatsJson: string): string;

