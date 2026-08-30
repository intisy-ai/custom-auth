package io.github.intisy.ai.custom;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * One routable lane per configured endpoint, in the two shapes a host reads them in.
 *
 * @implNote Both shapes carry this plugin's own identity, its id, the bundle serving a request and
 *           the translator name it files its lanes under, so those live here rather than being
 *           restated by whichever caller happens to build a lane.
 */
public final class Lanes {
    private Lanes() {
    }

    /** This plugin's id, which is also its clone directory and the key its lanes are filed under. */
    public static final String PLUGIN_ID = "custom-auth";

    /** The bundle a host loads to serve a request on one of these lanes. */
    public static final String HANDLER = "dist/handler.js";

    /** The translator name a lane is filed under; the wire format itself is per endpoint. */
    public static final String TRANSLATOR = "custom";

    /**
     * The lanes a host's provider scan reads out of the app home's dynamic manifest.
     *
     * @param endpoints the endpoints already configured
     * @return one entry per endpoint, in configuration order
     */
    public static List<Map<String, Object>> dynamicManifest(List<Endpoint> endpoints) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        if (endpoints == null) return out;
        for (Endpoint e : endpoints) {
            Map<String, Object> entry = new LinkedHashMap<String, Object>();
            entry.put("name", e.id);
            entry.put("repo", PLUGIN_ID);
            entry.put("handler", HANDLER);
            entry.put("translator", TRANSLATOR);
            entry.put("accountPool", e.id);
            out.add(entry);
        }
        return out;
    }

    /**
     * The lanes an in-process host asks the provider capability for.
     *
     * @param endpoints the endpoints already configured
     * @return one provider descriptor per endpoint, in configuration order
     */
    public static List<Map<String, Object>> descriptors(List<Endpoint> endpoints) {
        List<Map<String, Object>> out = new ArrayList<Map<String, Object>>();
        if (endpoints == null) return out;
        for (Endpoint e : endpoints) {
            Map<String, Object> models = new LinkedHashMap<String, Object>();
            if (e.models != null) {
                for (String model : e.models) {
                    Map<String, Object> named = new LinkedHashMap<String, Object>();
                    named.put("name", model);
                    models.put(model, named);
                }
            }
            Map<String, Object> descriptor = new LinkedHashMap<String, Object>();
            descriptor.put("id", e.id);
            descriptor.put("label", e.label);
            descriptor.put("models", models);
            descriptor.put("hasOAuth", Boolean.FALSE);
            descriptor.put("accountPool", e.id);
            descriptor.put("translator", TRANSLATOR);
            out.add(descriptor);
        }
        return out;
    }
}
