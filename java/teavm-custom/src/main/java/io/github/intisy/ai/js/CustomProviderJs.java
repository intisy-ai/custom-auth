package io.github.intisy.ai.js;

import io.github.intisy.ai.custom.CustomEndpointResolver;
import io.github.intisy.ai.custom.CustomHandleIr;
import io.github.intisy.ai.custom.CustomHandleIrException;
import io.github.intisy.ai.custom.Endpoint;
import io.github.intisy.ai.custom.EndpointJson;
import io.github.intisy.ai.ir.IrRequest;
import io.github.intisy.ai.ir.IrResponse;
import io.github.intisy.ai.ir.json.IrJson;
import io.github.intisy.ai.ir.spi.JsonCodec;

import org.teavm.jso.JSExport;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * TeaVM JS export surface over custom-auth's endpoint resolution + the OpenAI encode/decode half
 * of handleIr (reusing openai-translator's Java, never re-implemented). Mirrors
 * openai-translator's own {@code OpenaiTranslatorJs} export style. The actual upstream HTTP call
 * and the per-endpoint API key lookup stay host-side (TS): this surface only resolves + translates.
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

    /** Resolves the endpoint and encodes the IR request (model rewritten to the endpoint's
     *  upstream model) to the endpoint's wire format, via openai-translator's Java. Returns
     *  {@code {endpointId, wireBody}}, or an error envelope on a resolve/format failure. */
    @JSExport
    public static String prepareRequest(String endpointsJson, String irRequestJson, String provider) {
        JsonCodec json = new SimpleJsonCodec();
        try {
            List<Endpoint> endpoints = EndpointJson.parseList(json, endpointsJson);
            IrRequest irRequest = IrJson.parseRequest(json, irRequestJson);
            CustomHandleIr.PreparedRequest prepared = CustomHandleIr.prepareRequest(json, endpoints, irRequest, provider);
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("endpointId", prepared.endpointId);
            out.put("endpoint", endpointToMap(prepared.endpoint));
            out.put("wireBody", prepared.wireBody);
            return json.stringify(out);
        } catch (CustomHandleIrException e) {
            return json.stringify(errorEnvelope(e));
        }
    }

    /** Decodes a 2xx upstream OpenAI-format response back to IR (JSON in, JSON out). */
    @JSExport
    public static String decodeResponse(String wireResponseJson) {
        JsonCodec json = new SimpleJsonCodec();
        IrResponse response = CustomHandleIr.decodeResponse(json, wireResponseJson);
        return IrJson.serializeResponse(json, response);
    }
}
