package io.github.intisy.ai.custom;

import java.util.Map;

/**
 * The typed transport error {@link CustomEndpointResolver}/{@link CustomHandleIr} throw for a
 * resolve failure or a non-2xx upstream outcome, carrying status/headers/body so the host can
 * reconstruct an equivalent response. Mirrors core-proxy's {@code HandleIrException} shape
 * ({@code io.github.intisy.ai.shared.routing.HandleIrException}); custom-auth's Java module has no
 * core-proxy submodule, so this is its own equivalent rather than a shared dependency.
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
