package io.github.intisy.ai.custom;

import java.util.List;

/**
 * A configured custom endpoint: mirrors the TS {@code Endpoint} type in {@code src/endpoints.ts}
 * (baseUrl + upstream wire format + the models it advertises). The API key is never part of this
 * shape; it is resolved by the host (core-auth's AccountManager) and injected separately.
 */
public final class Endpoint {
    /** Its permanent id, which is also its account pool and the lane it is filed under. */
    public final String id;
    /** What a surface shows for it. */
    public final String label;
    /** The upstream root a request is sent to, with or without a trailing slash. */
    public final String baseUrl;
    /** The wire format it speaks, which a translator must be installed for. */
    public final String format;
    /** The upstream model ids it advertises. */
    public final List<String> models;

    /**
     * @param id its permanent id
     * @param label what a surface shows for it
     * @param baseUrl the upstream root a request is sent to
     * @param format the wire format it speaks
     * @param models the upstream model ids it advertises
     */
    public Endpoint(String id, String label, String baseUrl, String format, List<String> models) {
        this.id = id;
        this.label = label;
        this.baseUrl = baseUrl;
        this.format = format;
        this.models = models;
    }
}
