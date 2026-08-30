package io.github.intisy.ai.custom;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class EndpointRulesTest {
    private static final List<String> FORMATS = Arrays.asList("openai", "anthropic");

    private static Endpoint endpoint(String id, String label, String baseUrl, String format, String... models) {
        return new Endpoint(id, label, baseUrl, format, Arrays.asList(models));
    }

    private static Endpoint valid() {
        return endpoint("groq", "Groq", "https://api.groq.com/openai/v1", "openai", "llama-3.1-70b");
    }

    private static List<Endpoint> existing() {
        return Arrays.asList(
                endpoint("groq", "Groq", "https://api.groq.com/openai/v1", "openai", "llama-3.1-70b"),
                endpoint("together", "Together", "https://api.together.xyz/v1", "openai", "mixtral-8x7b", "qwen"));
    }

    @Test
    void acceptsAConfiguredEndpointWhoseFormatIsInstalled() {
        assertNull(EndpointRules.validate(valid(), existing(), false, FORMATS));
    }

    @Test
    void rejectsAnIdThatIsMissingOrCarriesIllegalCharacters() {
        assertEquals("endpoint id is required",
                EndpointRules.validate(endpoint("  ", "L", "https://a.example", "openai", "m"), null, false, FORMATS));
        assertEquals("endpoint id may only use letters, numbers, dot, dash and underscore",
                EndpointRules.validate(endpoint("a b", "L", "https://a.example", "openai", "m"), null, false, FORMATS));
    }

    @Test
    void rejectsADuplicateIdOnlyWhenAskedTo() {
        assertEquals("there is already an endpoint called groq",
                EndpointRules.validate(valid(), existing(), true, FORMATS));
        assertNull(EndpointRules.validate(valid(), existing(), false, FORMATS));
    }

    @Test
    void rejectsAMissingLabel() {
        assertEquals("label is required",
                EndpointRules.validate(endpoint("groq", " ", "https://a.example", "openai", "m"), null, false, FORMATS));
    }

    @Test
    void separatesAMissingBaseUrlFromAnUnparseableOneAndAWrongScheme() {
        assertEquals("base URL is required",
                EndpointRules.validate(endpoint("groq", "L", "", "openai", "m"), null, false, FORMATS));
        assertEquals("base URL is not a valid URL",
                EndpointRules.validate(endpoint("groq", "L", "api.groq.com", "openai", "m"), null, false, FORMATS));
        assertEquals("base URL must be http or https",
                EndpointRules.validate(endpoint("groq", "L", "ftp://api.groq.com", "openai", "m"), null, false, FORMATS));
    }

    @Test
    void acceptsPlainHttpAndIsNotCaseSensitiveAboutTheScheme() {
        assertNull(EndpointRules.validate(endpoint("local", "Local", "http://127.0.0.1:8080/v1", "openai", "m"),
                null, false, FORMATS));
        assertNull(EndpointRules.validate(endpoint("local", "Local", "HTTPS://api.example/v1", "openai", "m"),
                null, false, FORMATS));
    }

    @Test
    void rejectsAFormatNoTranslatorIsInstalledFor() {
        assertEquals("unsupported wire format: gemini",
                EndpointRules.validate(endpoint("g", "G", "https://a.example", "gemini", "m"), null, false, FORMATS));
        // The floor is empty until a host asks what is installed, so nothing passes against it.
        assertEquals("unsupported wire format: openai",
                EndpointRules.validate(valid(), null, false, Collections.<String>emptyList()));
    }

    @Test
    void rejectsAnEndpointAdvertisingNoModel() {
        assertEquals("at least one model id is required",
                EndpointRules.validate(endpoint("groq", "Groq", "https://a.example", "openai"), null, false, FORMATS));
    }

    @Test
    void upsertReplacesByIdInPlaceAndAppendsAnythingNew() {
        Endpoint replacement = endpoint("groq", "Groq v2", "https://api.groq.com/v2", "openai", "llama-3.3");
        List<Endpoint> replaced = EndpointRules.upsert(existing(), replacement);
        assertEquals(2, replaced.size());
        assertEquals("Groq v2", replaced.get(0).label);
        assertEquals("together", replaced.get(1).id);

        List<Endpoint> appended = EndpointRules.upsert(existing(), endpoint("fresh", "Fresh", "https://f.example", "openai", "m"));
        assertEquals(3, appended.size());
        assertEquals("fresh", appended.get(2).id);
    }

    @Test
    void upsertLeavesTheListItWasGivenAlone() {
        List<Endpoint> input = new ArrayList<Endpoint>(existing());
        EndpointRules.upsert(input, endpoint("fresh", "Fresh", "https://f.example", "openai", "m"));
        assertEquals(2, input.size());
    }

    @Test
    void removeDropsOnlyTheNamedEndpoint() {
        List<Endpoint> next = EndpointRules.remove(existing(), "groq");
        assertEquals(1, next.size());
        assertEquals("together", next.get(0).id);
        assertEquals(2, EndpointRules.remove(existing(), "never-configured").size());
    }

    @Test
    void advertisedModelsNamespaceEveryModelByItsEndpoint() {
        assertEquals(Arrays.asList("groq/llama-3.1-70b", "together/mixtral-8x7b", "together/qwen"),
                EndpointRules.advertisedModels(existing()));
        assertTrue(EndpointRules.advertisedModels(null).isEmpty());
    }

    @Test
    void displayNamesPairEachModelWithItsEndpointLabel() {
        Map<String, String> names = EndpointRules.displayNames(existing());
        assertEquals("Groq / llama-3.1-70b", names.get("groq/llama-3.1-70b"));
        assertEquals("Together / qwen", names.get("together/qwen"));
    }

    @Test
    void displayNamesFallBackToTheIdWhenAnEndpointCarriesNoLabel() {
        Map<String, String> names = EndpointRules.displayNames(
                Collections.singletonList(endpoint("bare", "", "https://a.example", "openai", "m")));
        assertEquals("bare / m", names.get("bare/m"));
    }
}
