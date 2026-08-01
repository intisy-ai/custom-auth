package io.github.intisy.ai.custom;

import java.util.List;

/**
 * Resolves the endpoint to serve for a request, mirroring {@code src/endpoints.ts}'s
 * {@code resolveEndpoint}/{@code splitModel}. The resolved provider id names the endpoint directly
 * (the Phase-4 per-endpoint provider); a namespaced {@code <endpointId>/<model>} is the back-compat
 * fallback used when no provider id is supplied, or when the supplied provider id names no
 * configured endpoint. The API key is resolved by the host (core-auth's AccountManager) and is not
 * this class's concern.
 */
public final class CustomEndpointResolver {
    private CustomEndpointResolver() {
    }

    public static final class SplitModel {
        public final String endpointId;
        public final String upstreamModel;

        public SplitModel(String endpointId, String upstreamModel) {
            this.endpointId = endpointId;
            this.upstreamModel = upstreamModel;
        }
    }

    public static final class Resolution {
        public final String endpointId;
        public final String upstreamModel;
        public final Endpoint endpoint;

        public Resolution(String endpointId, String upstreamModel, Endpoint endpoint) {
            this.endpointId = endpointId;
            this.upstreamModel = upstreamModel;
            this.endpoint = endpoint;
        }
    }

    public static SplitModel splitModel(String model) {
        int slash = model.indexOf('/');
        if (slash < 0) {
            throw new CustomHandleIrException(400, "custom-auth: model must be <endpointId>/<model>, got: " + model);
        }
        return new SplitModel(model.substring(0, slash), model.substring(slash + 1));
    }

    private static Endpoint findById(List<Endpoint> endpoints, String id) {
        for (Endpoint e : endpoints) {
            if (e.id.equals(id)) return e;
        }
        return null;
    }

    public static Resolution resolve(List<Endpoint> endpoints, String model, String provider) {
        Endpoint byProvider = provider != null ? findById(endpoints, provider) : null;
        String endpointId;
        String upstreamModel;
        if (byProvider != null) {
            endpointId = byProvider.id;
            upstreamModel = model;
        } else {
            SplitModel split = splitModel(model);
            endpointId = split.endpointId;
            upstreamModel = split.upstreamModel;
        }
        Endpoint endpoint = findById(endpoints, endpointId);
        if (endpoint == null) {
            throw new CustomHandleIrException(400, "custom-auth: unknown endpoint " + endpointId);
        }
        return new Resolution(endpointId, upstreamModel, endpoint);
    }
}
