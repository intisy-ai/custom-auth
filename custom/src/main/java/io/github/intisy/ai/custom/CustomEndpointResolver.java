package io.github.intisy.ai.custom;

import java.util.List;

/**
 * Resolves the endpoint to serve for a request, mirroring {@code src/endpoints.ts}'s
 * {@code resolveEndpoint}/{@code splitModel}. The resolved provider id names the endpoint directly
 * (a per-endpoint provider); a namespaced {@code <endpointId>/<model>} is the back-compat
 * fallback used when no provider id is supplied, or when the supplied provider id names no
 * configured endpoint. The API key is resolved by the host (core-auth's AccountManager) and is not
 * this class's concern.
 */
public final class CustomEndpointResolver {
    private CustomEndpointResolver() {
    }

    /** A namespaced model id taken apart. */
    public static final class SplitModel {
        /** The endpoint the model is namespaced under. */
        public final String endpointId;
        /** The model id as the upstream knows it. */
        public final String upstreamModel;

        /**
         * @param endpointId the endpoint the model is namespaced under
         * @param upstreamModel the model id as the upstream knows it
         */
        public SplitModel(String endpointId, String upstreamModel) {
            this.endpointId = endpointId;
            this.upstreamModel = upstreamModel;
        }
    }

    /** Which endpoint serves a request, and as which upstream model. */
    public static final class Resolution {
        /** The endpoint's id. */
        public final String endpointId;
        /** The model id to send upstream. */
        public final String upstreamModel;
        /** The endpoint itself, as configured. */
        public final Endpoint endpoint;

        /**
         * @param endpointId the endpoint's id
         * @param upstreamModel the model id to send upstream
         * @param endpoint the endpoint itself, as configured
         */
        public Resolution(String endpointId, String upstreamModel, Endpoint endpoint) {
            this.endpointId = endpointId;
            this.upstreamModel = upstreamModel;
            this.endpoint = endpoint;
        }
    }

    /**
     * Takes a namespaced {@code <endpointId>/<model>} apart.
     *
     * @param model the namespaced model id
     * @return its two halves
     * @throws CustomHandleIrException when the id carries no namespace, which the host turns into a
     *                                 400 rather than guessing an endpoint
     */
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

    /**
     * Resolves which configured endpoint serves a request.
     *
     * @param endpoints the endpoints already configured
     * @param model the model the request names
     * @param provider the resolved provider id naming an endpoint directly, or null to fall back to
     *                 the namespaced form
     * @return the endpoint and the model to send upstream
     * @throws CustomHandleIrException when no configured endpoint answers
     */
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
