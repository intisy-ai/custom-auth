package io.github.intisy.ai.js;

import io.github.intisy.ai.custom.CustomEndpointResolver;
import io.github.intisy.ai.custom.CustomHandleIrException;
import io.github.intisy.ai.custom.Endpoint;
import io.github.intisy.ai.custom.EndpointJson;
import io.github.intisy.ai.custom.EndpointRules;
import io.github.intisy.ai.custom.Lanes;
import io.github.intisy.ai.ir.spi.JsonCodec;
import io.github.intisy.ai.ir.json.SimpleJsonCodec;

import org.teavm.jso.JSExport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The JS export surface over custom-auth's endpoint rules.
 *
 * <p>Every decision this provider makes about a configured endpoint is reached through here. What
 * stays outside is what needs a host: reading and writing the configuration, the account store the
 * API keys live in, the app home the lane manifest is published into, the installed translator, and
 * the request itself.
 *
 * <p>Translation in particular can never move here. This provider speaks whatever wire formats are
 * installed, so compiling one vendor's translator into this bundle would pick a format at build
 * time, which is the thing the provider stopped doing.
 *
 * @implNote Values cross as JSON text rather than as objects, and a thrown
 *           {@link CustomHandleIrException} is caught here and returned as
 *           {@code {"error":{"status":..,"body":..}}} rather than crossing as a raw JS exception,
 *           so the host shell can build its own typed error from the fields.
 */
public final class CustomProviderJs {
    private CustomProviderJs() {
    }

    private static Map<String, Object> errorEnvelope(CustomHandleIrException e) {
        Map<String, Object> error = new LinkedHashMap<String, Object>();
        error.put("status", e.status);
        error.put("body", e.body);
        Map<String, Object> envelope = new LinkedHashMap<String, Object>();
        envelope.put("error", error);
        return envelope;
    }

    /**
     * Resolves the endpoint and upstream model a request maps to.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param model the model the request names
     * @param provider the resolved provider id naming an endpoint directly, or null to fall back to
     *                 the namespaced {@code <endpointId>/<model>} form
     * @return {@code {endpointId, upstreamModel, endpoint}} as JSON, or an error envelope
     */
    @JSExport
    public static String resolveEndpoint(String endpointsJson, String model, String provider) {
        JsonCodec json = new SimpleJsonCodec();
        try {
            List<Endpoint> endpoints = EndpointJson.parseList(json, endpointsJson);
            CustomEndpointResolver.Resolution r = CustomEndpointResolver.resolve(endpoints, model, provider);
            Map<String, Object> out = new LinkedHashMap<String, Object>();
            out.put("endpointId", r.endpointId);
            out.put("upstreamModel", r.upstreamModel);
            out.put("endpoint", EndpointJson.toMap(r.endpoint));
            return json.stringify(out);
        } catch (CustomHandleIrException e) {
            return json.stringify(errorEnvelope(e));
        }
    }

    /**
     * Why an endpoint would not work.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param endpointJson the endpoint being added or replaced, as its JSON object
     * @param rejectDuplicate whether an id already configured is a problem
     * @param formatsJson the wire formats a translator is installed for, as a JSON array
     * @return {@code {"problem": <reason or null>}} as JSON
     */
    @JSExport
    public static String validateEndpoint(String endpointsJson, String endpointJson, boolean rejectDuplicate,
                                          String formatsJson) {
        JsonCodec json = new SimpleJsonCodec();
        String problem = EndpointRules.validate(
                EndpointJson.parseOne(json, endpointJson),
                EndpointJson.parseList(json, endpointsJson),
                rejectDuplicate,
                EndpointJson.parseStrings(json, formatsJson));
        Map<String, Object> out = new LinkedHashMap<String, Object>();
        out.put("problem", problem);
        return json.stringify(out);
    }

    /**
     * The endpoint list with one added or replaced, matched by id.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param endpointJson the endpoint to add or replace with, as its JSON object
     * @return the resulting endpoint array as JSON
     */
    @JSExport
    public static String upsertEndpoint(String endpointsJson, String endpointJson) {
        JsonCodec json = new SimpleJsonCodec();
        List<Endpoint> next = EndpointRules.upsert(
                EndpointJson.parseList(json, endpointsJson),
                EndpointJson.parseOne(json, endpointJson));
        return json.stringify(EndpointJson.toList(next));
    }

    /**
     * The endpoint list without the one named.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @param id the endpoint id to drop
     * @return the resulting endpoint array as JSON
     */
    @JSExport
    public static String removeEndpoint(String endpointsJson, String id) {
        JsonCodec json = new SimpleJsonCodec();
        List<Endpoint> next = EndpointRules.remove(EndpointJson.parseList(json, endpointsJson), id);
        return json.stringify(EndpointJson.toList(next));
    }

    /**
     * Every advertised model with the name a surface shows for it.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return namespaced model id to display name, as a JSON object
     */
    @JSExport
    public static String displayNames(String endpointsJson) {
        JsonCodec json = new SimpleJsonCodec();
        Map<String, String> names = EndpointRules.displayNames(
                EndpointJson.parseList(json, endpointsJson));
        return json.stringify(new LinkedHashMap<String, Object>(names));
    }

    /**
     * The lanes a host's provider scan reads out of the app home's dynamic manifest.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return one entry per endpoint, as a JSON array
     */
    @JSExport
    public static String dynamicManifest(String endpointsJson) {
        JsonCodec json = new SimpleJsonCodec();
        return json.stringify(Lanes.dynamicManifest(EndpointJson.parseList(json, endpointsJson)));
    }

    /**
     * The lanes an in-process host asks the provider capability for.
     *
     * @param endpointsJson the configured endpoints, as their JSON array
     * @return one provider descriptor per endpoint, as a JSON array
     */
    @JSExport
    public static String providerDescriptors(String endpointsJson) {
        JsonCodec json = new SimpleJsonCodec();
        return json.stringify(Lanes.descriptors(EndpointJson.parseList(json, endpointsJson)));
    }
}
