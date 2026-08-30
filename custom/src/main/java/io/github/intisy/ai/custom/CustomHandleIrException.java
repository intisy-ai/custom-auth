package io.github.intisy.ai.custom;

import java.util.Map;

/**
 * The typed transport error {@link CustomEndpointResolver} throws for a resolve failure, carrying
 * status/headers/body so the host can reconstruct an equivalent response. Mirrors {@link io.github.intisy.ai.ir.spi.HandleIrException}'s
 * shape, carrying its own name marker because the front-door recognises a typed handler error by
 * that marker rather than by class identity.
 */
public class CustomHandleIrException extends RuntimeException {
    /** The HTTP status the host reconstructs its response with. */
    public final int status;
    /** The headers to carry through, or null when there are none. */
    public final Map<String, String> headers;
    /** The response body to carry through verbatim. */
    public final String body;

    /**
     * @param status the HTTP status the host reconstructs its response with
     * @param headers the headers to carry through, or null when there are none
     * @param body the response body to carry through verbatim
     */
    public CustomHandleIrException(int status, Map<String, String> headers, String body) {
        super("custom-auth handleIr error: " + status);
        this.status = status;
        this.headers = headers;
        this.body = body;
    }

    /**
     * @param status the HTTP status the host reconstructs its response with
     * @param body the response body to carry through verbatim
     */
    public CustomHandleIrException(int status, String body) {
        this(status, null, body);
    }
}
