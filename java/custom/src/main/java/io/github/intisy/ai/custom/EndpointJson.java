package io.github.intisy.ai.custom;

import io.github.intisy.ai.ir.json.JsonUtil;
import io.github.intisy.ai.ir.spi.JsonCodec;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** {@link Endpoint} list &lt;-&gt; JSON, matching the shape {@code src/endpoints.ts}'s
 *  {@code Endpoint} type serializes to ({@code id, label, baseUrl, format, models[]}). */
public final class EndpointJson {
    private EndpointJson() {
    }

    public static List<Endpoint> parseList(JsonCodec json, String endpointsJson) {
        List<Object> raw = JsonUtil.asList(json.parse(endpointsJson));
        List<Endpoint> out = new ArrayList<>();
        if (raw == null) return out;
        for (Object item : raw) {
            Map<String, Object> m = JsonUtil.asMap(item);
            if (m == null) continue;
            List<Object> rawModels = JsonUtil.asList(m.get("models"));
            List<String> models = new ArrayList<>();
            if (rawModels != null) {
                for (Object model : rawModels) models.add(String.valueOf(model));
            }
            out.add(new Endpoint(
                    JsonUtil.asString(m.get("id")),
                    JsonUtil.asString(m.get("label")),
                    JsonUtil.asString(m.get("baseUrl")),
                    JsonUtil.asString(m.get("format")),
                    models));
        }
        return out;
    }
}
