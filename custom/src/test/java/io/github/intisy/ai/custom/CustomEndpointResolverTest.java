package io.github.intisy.ai.custom;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CustomEndpointResolverTest {
    private static List<Endpoint> endpoints() {
        return Arrays.asList(
                new Endpoint("groq", "Groq", "https://api.groq.com/openai/v1", "openai", Arrays.asList("llama-3.1-70b")),
                new Endpoint("together", "Together", "https://api.together.xyz/v1", "openai", Arrays.asList("mixtral-8x7b"))
        );
    }

    @Test
    void resolvesByProviderIdWithoutSplittingTheModel() {
        CustomEndpointResolver.Resolution r = CustomEndpointResolver.resolve(endpoints(), "llama-3.1-70b", "groq");
        assertEquals("groq", r.endpointId);
        assertEquals("llama-3.1-70b", r.upstreamModel);
        assertEquals("https://api.groq.com/openai/v1", r.endpoint.baseUrl);
    }

    @Test
    void resolvesByNamespacedModelWhenNoProviderGiven() {
        CustomEndpointResolver.Resolution r = CustomEndpointResolver.resolve(endpoints(), "together/mixtral-8x7b", null);
        assertEquals("together", r.endpointId);
        assertEquals("mixtral-8x7b", r.upstreamModel);
    }

    @Test
    void fallsBackToNamespacedSplitWhenProviderMatchesNoEndpoint() {
        CustomEndpointResolver.Resolution r = CustomEndpointResolver.resolve(endpoints(), "groq/llama-3.1-70b", "unrelated-provider");
        assertEquals("groq", r.endpointId);
        assertEquals("llama-3.1-70b", r.upstreamModel);
    }

    @Test
    void throwsOnUnknownEndpoint() {
        CustomHandleIrException ex = assertThrows(CustomHandleIrException.class,
                () -> CustomEndpointResolver.resolve(endpoints(), "ghost/some-model", null));
        assertEquals(400, ex.status);
    }

    @Test
    void throwsOnModelWithNoSlashAndNoMatchingProvider() {
        CustomHandleIrException ex = assertThrows(CustomHandleIrException.class,
                () -> CustomEndpointResolver.resolve(endpoints(), "llama-3.1-70b", null));
        assertEquals(400, ex.status);
    }

    @Test
    void throwsOnEmptyEndpointList() {
        assertThrows(CustomHandleIrException.class,
                () -> CustomEndpointResolver.resolve(Collections.emptyList(), "groq/llama-3.1-70b", null));
    }
}
