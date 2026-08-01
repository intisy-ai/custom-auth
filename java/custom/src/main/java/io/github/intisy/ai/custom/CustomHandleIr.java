package io.github.intisy.ai.custom;

import io.github.intisy.ai.ir.IrRequest;
import io.github.intisy.ai.ir.IrResponse;
import io.github.intisy.ai.ir.json.IrJson;
import io.github.intisy.ai.ir.spi.JsonCodec;
import io.github.intisy.ai.translator.openai.OpenaiTranslator;

import java.util.List;

/**
 * The IR&lt;-&gt;upstream half of custom-auth's handleIr, reusing openai-translator's Java
 * encode/decode (never re-implemented). Resolves the endpoint and encodes the IR request to the
 * endpoint's wire format; separately decodes the upstream wire response back to IR. The actual
 * HTTP call is the host's job (Node fetch, or a real client on the JVM): this class never performs
 * I/O itself, so it stays TeaVM-transpilable.
 */
public final class CustomHandleIr {
    private CustomHandleIr() {
    }

    public static final class PreparedRequest {
        public final String endpointId;
        public final Endpoint endpoint;
        public final String wireBody;

        public PreparedRequest(String endpointId, Endpoint endpoint, String wireBody) {
            this.endpointId = endpointId;
            this.endpoint = endpoint;
            this.wireBody = wireBody;
        }
    }

    /**
     * Resolves the endpoint for {@code irRequest.model}/{@code provider} and encodes a copy of the
     * IR request (its model rewritten to the endpoint's upstream model) to the endpoint's wire
     * format. Only the "openai" format is supported; any other configured format fails fast,
     * mirroring driver.ts's handleIr. {@code irRequest} itself is left untouched.
     */
    public static PreparedRequest prepareRequest(JsonCodec json, List<Endpoint> endpoints, IrRequest irRequest, String provider) {
        CustomEndpointResolver.Resolution resolution = CustomEndpointResolver.resolve(endpoints, irRequest.model, provider);
        if (!"openai".equals(resolution.endpoint.format)) {
            throw new CustomHandleIrException(400, "custom-auth: unsupported wire format " + resolution.endpoint.format);
        }
        IrRequest upstreamRequest = IrJson.parseRequest(json, IrJson.serializeRequest(json, irRequest));
        upstreamRequest.model = resolution.upstreamModel;
        String wireBody = new OpenaiTranslator(json).encodeRequest(upstreamRequest);
        return new PreparedRequest(resolution.endpointId, resolution.endpoint, wireBody);
    }

    /**
     * Decodes a 2xx upstream OpenAI-format response back to IR. A non-2xx outcome is the host's
     * job to turn into a {@link CustomHandleIrException} (or its TS HandleIrError equivalent)
     * before this is ever called.
     */
    public static IrResponse decodeResponse(JsonCodec json, String wireResponseJson) {
        return new OpenaiTranslator(json).decodeResponse(wireResponseJson);
    }
}
