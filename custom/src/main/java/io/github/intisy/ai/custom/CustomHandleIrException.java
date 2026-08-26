package io.github.intisy.ai.custom;

import java.util.Map;

/**
 * The typed transport error {@link CustomEndpointResolver}/{@link CustomHandleIr} throw for a
 * resolve failure or a non-2xx upstream outcome, carrying status/headers/body so the host can
 * reconstruct an equivalent response. Mirrors {@link io.github.intisy.ai.ir.spi.HandleIrException}'s
 * shape, carrying its own name marker because the front-door recognises a typed handler error by
 * that marker rather than by class identity.
 */
public class CustomHandleIrException extends RuntimeException {
    public final int status;
    public final Map<String, String> headers;
    public final String body;

    public CustomHandleIrException(int status, Map<String, String> headers, String body) {
        super("custom-auth handleIr error: " + status);
        this.status = status;
        this.headers = headers;
        this.body = body;
    }

    public CustomHandleIrException(int status, String body) {
        this(status, null, body);
    }
}
