package io.github.intisy.ai.custom;

import io.github.intisy.ai.ir.IrMessage;
import io.github.intisy.ai.ir.IrRequest;
import io.github.intisy.ai.ir.IrResponse;
import io.github.intisy.ai.ir.TextBlock;
import io.github.intisy.ai.ir.spi.JsonCodec;
import io.github.intisy.ai.js.SimpleJsonCodec;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CustomHandleIrTest {
    private static final JsonCodec JSON = new SimpleJsonCodec();

    private static List<Endpoint> endpoints() {
        return Collections.singletonList(
                new Endpoint("groq", "Groq", "https://api.groq.com/openai/v1", "openai", Arrays.asList("llama-3.1-70b")));
    }

    private static IrRequest sampleRequest() {
        IrRequest request = new IrRequest();
        request.model = "groq/llama-3.1-70b";
        request.stream = false;
        IrMessage message = new IrMessage();
        message.role = "user";
        List<io.github.intisy.ai.ir.Block> content = new ArrayList<>();
        content.add(new TextBlock("Hello, custom endpoint!"));
        message.content = content;
        request.messages = Collections.singletonList(message);
        return request;
    }

    // Frozen fixture: the exact OpenAI wire body driver.ts's handleIr produces for this IR request
    // via the SAME openai-translator Java (openaiTranslator.encodeRequest), reused here rather than
    // re-implemented. A change to OpenaiRequestCodec's encode shape must update this fixture (and
    // custom-auth's TS-side parity test) deliberately, in the same change.
    private static final String EXPECTED_WIRE_BODY =
            "{\"model\":\"llama-3.1-70b\",\"messages\":[{\"role\":\"user\",\"content\":[{\"type\":\"text\",\"text\":\"Hello, custom endpoint!\"}]}],\"stream\":false}";

    @Test
    void encodesTheResolvedRequestIdenticallyToTheTsPath() {
        CustomHandleIr.PreparedRequest prepared = CustomHandleIr.prepareRequest(JSON, endpoints(), sampleRequest(), null);
        assertEquals("groq", prepared.endpointId);
        assertEquals(EXPECTED_WIRE_BODY, prepared.wireBody);
    }

    @Test
    void leavesTheCallersIrRequestUntouched() {
        IrRequest request = sampleRequest();
        CustomHandleIr.prepareRequest(JSON, endpoints(), request, null);
        assertEquals("groq/llama-3.1-70b", request.model);
    }

    @Test
    void rejectsAnUnsupportedWireFormat() {
        List<Endpoint> endpoints = Collections.singletonList(
                new Endpoint("weird", "Weird", "https://example.com", "gemini", Collections.singletonList("m")));
        IrRequest request = sampleRequest();
        request.model = "weird/m";
        CustomHandleIrException ex = assertThrows(CustomHandleIrException.class,
                () -> CustomHandleIr.prepareRequest(JSON, endpoints, request, null));
        assertEquals(400, ex.status);
    }

    @Test
    void decodesAnUpstreamOpenaiResponseBackToIr() {
        String wireResponse = "{\"id\":\"chatcmpl-1\",\"model\":\"llama-3.1-70b\",\"choices\":[{\"index\":0,"
                + "\"message\":{\"role\":\"assistant\",\"content\":\"Hi there!\"},\"finish_reason\":\"stop\"}]}";
        IrResponse response = CustomHandleIr.decodeResponse(JSON, wireResponse);
        assertEquals("llama-3.1-70b", response.model);
    }
}
