package io.github.intisy.ai.custom;

import io.github.intisy.ai.ir.json.JsonUtil;
import io.github.intisy.ai.ir.spi.JsonCodec;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * {@link Endpoint} values to and from the JSON shape they are configured in,
 * {@code {id, label, baseUrl, format, models[]}}.
 */
public final class EndpointJson {
    private EndpointJson() {
    }

    /**
     * One endpoint out of its already-parsed JSON object.
     *
     * @param map the parsed object, or null
     * @return the endpoint, or null when the value was not an object
     */
    public static Endpoint fromMap(Map<String, Object> map) {
        if (map == null) return null;
        List<Object> rawModels = JsonUtil.asList(map.get("models"));
        List<String> models = new ArrayList<String>();
        if (rawModels != null) {
            for (Object model : rawModels) models.add(String.valueOf(model));
        }
        return new Endpoint(
                JsonUtil.asString(map.get("id")),
                JsonUtil.asString(map.get("label")),
                JsonUtil.asString(map.get("baseUrl")),
                JsonUtil.asString(map.get("format")),
                models);
    }

    /**
     * One endpoint out of its JSON text.
     *
     * @param json the codec to parse with
     * @param endpointJson the endpoint's JSON object
     * @return the endpoint, or null when the text was not an object
     */
    public static Endpoint parseOne(JsonCodec json, String endpointJson) {
        return fromMap(JsonUtil.asMap(json.parse(endpointJson)));
    }

    /**
     * Every endpoint out of a JSON array, skipping anything that is not an object.
     *
     * @param json the codec to parse with
     * @param endpointsJson the configured endpoint array's JSON text
     * @return the endpoints, empty when the text was not an array
     */
    public static List<Endpoint> parseList(JsonCodec json, String endpointsJson) {
        List<Object> raw = JsonUtil.asList(json.parse(endpointsJson));
        List<Endpoint> out = new ArrayList<Endpoint>();
        if (raw == null) return out;
        for (Object item : raw) {
            Endpoint endpoint = fromMap(JsonUtil.asMap(item));
            if (endpoint != null) out.add(endpoint);
        }
        return out;
    }

    /**
     * One endpoint back into the JSON object shape it is configured in.
     *
     * @param endpoint the endpoint to serialize
     * @return its JSON object, ready for a codec to stringify
     */
    public static Map<String, Object> toMap(Endpoint endpoint) {
        Map<String, Object> map = new LinkedHashMap<String, Object>();
        map.put("id", endpoint.id);
        map.put("label", endpoint.label);
        map.put("baseUrl", endpoint.baseUrl);
        map.put("format", endpoint.format);
        map.put("models", endpoint.models);
        return map;
    }

    /**
     * Every endpoint back into the JSON array shape they are configured in.
     *
     * @param endpoints the endpoints to serialize
     * @return their JSON array, ready for a codec to stringify
     */
    public static List<Object> toList(List<Endpoint> endpoints) {
        List<Object> out = new ArrayList<Object>();
        for (Endpoint endpoint : endpoints) out.add(toMap(endpoint));
        return out;
    }

    /**
     * Every string out of a JSON array, skipping nothing.
     *
     * @param json the codec to parse with
     * @param arrayJson the array's JSON text
     * @return the strings, empty when the text was not an array
     */
    public static List<String> parseStrings(JsonCodec json, String arrayJson) {
        List<Object> raw = JsonUtil.asList(json.parse(arrayJson));
        List<String> out = new ArrayList<String>();
        if (raw == null) return out;
        for (Object item : raw) out.add(String.valueOf(item));
        return out;
    }
}
