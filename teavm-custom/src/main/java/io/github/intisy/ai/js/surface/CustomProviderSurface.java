package io.github.intisy.ai.js.surface;

import io.github.intisy.ai.tsemit.TsModule;
import io.github.intisy.ai.tsemit.TsNullable;

/**
 * custom-auth's JavaScript module surface, typed for a TypeScript consumer.
 *
 * @implNote Declares the shape {@code CustomProviderJs} actually exports; it is never implemented,
 * only emitted, and {@link TsModule} renders its members as free functions rather than an interface
 * a caller would have to cast a module namespace through. Every value crosses as JSON text, because
 * an endpoint list is data the host already holds serialised and reserialising it per field would
 * buy the caller nothing.
 */
@TsModule
public interface CustomProviderSurface {

    /**
     * Resolves the endpoint and upstream model a request maps to.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param model the model the request names
     * @param provider the resolved provider id naming an endpoint directly, or null to fall back to
     *                 the namespaced form
     * @return {@code {endpointId, upstreamModel, endpoint}} as JSON, or
     *         {@code {error:{status,body}}} when no configured endpoint answers
     */
    String resolveEndpoint(String endpointsJson, String model, @TsNullable String provider);

    /**
     * Why an endpoint would not work.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param endpointJson the endpoint being added or replaced, as its JSON object
     * @param rejectDuplicate whether an id already configured is a problem
     * @param formatsJson the wire formats a translator is installed for, as a JSON array
     * @return {@code {problem}} as JSON, the problem being null when the endpoint would work
     */
    String validateEndpoint(String endpointsJson, String endpointJson, boolean rejectDuplicate,
                            String formatsJson);

    /**
     * The endpoint list with one added or replaced, matched by id.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param endpointJson the endpoint to add or replace with, as its JSON object
     * @return the resulting endpoint array as JSON
     */
    String upsertEndpoint(String endpointsJson, String endpointJson);

    /**
     * The endpoint list without the one named.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param id the endpoint id to drop
     * @return the resulting endpoint array as JSON
     */
    String removeEndpoint(String endpointsJson, String id);

    /**
     * Every advertised model with the name a surface shows for it.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return namespaced model id to display name, as a JSON object
     */
    String displayNames(String endpointsJson);

    /**
     * The lanes a host's provider scan reads out of the app home's dynamic manifest.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return one entry per endpoint, as a JSON array
     */
    String dynamicManifest(String endpointsJson);

    /**
     * The lanes an in-process host asks the provider capability for.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return one provider descriptor per endpoint, as a JSON array
     */
    String providerDescriptors(String endpointsJson);
}
