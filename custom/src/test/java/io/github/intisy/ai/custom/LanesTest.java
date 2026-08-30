package io.github.intisy.ai.custom;

import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LanesTest {
    private static List<Endpoint> endpoints() {
        return Arrays.asList(
                new Endpoint("groq", "Groq", "https://api.groq.com/openai/v1", "openai", Arrays.asList("llama-3.1-70b")),
                new Endpoint("together", "Together", "https://api.together.xyz/v1", "openai", Arrays.asList("mixtral-8x7b", "qwen")));
    }

    @Test
    void everyManifestEntryPointsAtThisPluginsHandler() {
        List<Map<String, Object>> entries = Lanes.dynamicManifest(endpoints());
        assertEquals(2, entries.size());
        assertEquals("groq", entries.get(0).get("name"));
        assertEquals("custom-auth", entries.get(0).get("repo"));
        assertEquals("dist/handler.js", entries.get(0).get("handler"));
        assertEquals("custom", entries.get(0).get("translator"));
        // Each endpoint is a first-class provider with its own key pool, named after itself.
        assertEquals("together", entries.get(1).get("accountPool"));
    }

    @Test
    void aDescriptorAdvertisesTheEndpointsModelsUnnamespaced() {
        List<Map<String, Object>> descriptors = Lanes.descriptors(endpoints());
        assertEquals(2, descriptors.size());
        assertEquals("Together", descriptors.get(1).get("label"));
        assertEquals(Boolean.FALSE, descriptors.get(1).get("hasOAuth"));

        @SuppressWarnings("unchecked")
        Map<String, Object> models = (Map<String, Object>) descriptors.get(1).get("models");
        assertEquals(2, models.size());
        @SuppressWarnings("unchecked")
        Map<String, Object> named = (Map<String, Object>) models.get("qwen");
        assertEquals("qwen", named.get("name"));
    }

    @Test
    void noEndpointsMeansNoLanesRatherThanNoAnswer() {
        assertTrue(Lanes.dynamicManifest(Collections.<Endpoint>emptyList()).isEmpty());
        assertTrue(Lanes.descriptors(null).isEmpty());
    }
}
