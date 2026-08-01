package io.github.intisy.ai.custom;

import java.util.List;

/**
 * A configured custom endpoint: mirrors the TS {@code Endpoint} type in {@code src/endpoints.ts}
 * (baseUrl + upstream wire format + the models it advertises). The API key is never part of this
 * shape; it is resolved by the host (core-auth's AccountManager) and injected separately.
 */
public final class Endpoint {
    public final String id;
    public final String label;
    public final String baseUrl;
    public final String format;
    public final List<String> models;

    public Endpoint(String id, String label, String baseUrl, String format, List<String> models) {
        this.id = id;
        this.label = label;
        this.baseUrl = baseUrl;
        this.format = format;
        this.models = models;
    }
}
