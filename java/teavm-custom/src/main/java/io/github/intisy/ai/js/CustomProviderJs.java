package io.github.intisy.ai.js;

import io.github.intisy.ai.custom.CustomEndpointResolver;
import io.github.intisy.ai.custom.CustomHandleIrException;
import io.github.intisy.ai.custom.Endpoint;
import io.github.intisy.ai.custom.EndpointJson;
import io.github.intisy.ai.ir.spi.JsonCodec;
import io.github.intisy.ai.ir.json.SimpleJsonCodec;

import org.teavm.jso.JSExport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * TeaVM JS export surface over custom-auth's endpoint resolution.
 *
 * Resolution only: this provider speaks whatever wire formats are INSTALLED, so translation
 * cannot live here. Binding a vendor's translator into this bundle would pick one format at
 * build time, which is exactly what the provider stopped doing. The host resolves here and
 * translates through the installed translator.
 *
 * A thrown {@link CustomHandleIrException} is caught at this boundary and returned as
 * {@code {"error":{"status":..,"body":..}}} rather than crossing as a raw JS exception, so the host
 * shell can construct its own typed error (HandleIrError) from the fields.
 */
public final class CustomProviderJs {
    private CustomProviderJs() {
    }

    private static Map<String, Object> errorEnvelope(CustomHandleIrException e) {
        Map<String, Object> error = new LinkedHashMap<>();
        error.put("status", e.status);
        error.put("body", e.body);
        Map<String, Object> envelope = new LinkedHashMap<>();
        envelope.put("error", error);
        return envelope;
    }

    private static Map<String, Object> endpointToMap(Endpoint endpoint) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", endpoint.id);
        m.put("label", endpoint.label);
        m.put("baseUrl", endpoint.baseUrl);
        m.put("format", endpoint.format);
        m.put("models", endpoint.models);
        return m;
    }

    /** Resolves the endpoint for {@code model}/{@code provider} against the configured
     *  {@code endpointsJson} list, mirroring {@code resolveEndpoint} in src/endpoints.ts (minus the
     *  API key, which the host resolves separately). */
    @JSExport
    public static String resolveEndpoint(String endpointsJson, String model, String provider) {
        JsonCodec json = new SimpleJsonCodec();
        try {
            List<Endpoint> endpoints = EndpointJson.parseList(json, endpointsJson);
            CustomEndpointResolver.Resolution r = CustomEndpointResolver.resolve(endpoints, model, provider);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("endpointId", r.endpointId);
            out.put("upstreamModel", r.upstreamModel);
            out.put("endpoint", endpointToMap(r.endpoint));
            return json.stringify(out);
        } catch (CustomHandleIrException e) {
            return json.stringify(errorEnvelope(e));
        }
    }


}
