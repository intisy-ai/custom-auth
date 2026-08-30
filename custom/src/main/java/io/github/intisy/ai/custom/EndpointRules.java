package io.github.intisy.ai.custom;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The one rule set deciding what makes a configured endpoint usable, and what a configured set of
 * endpoints advertises.
 *
 * @implNote Every rule here is a pure function of the endpoint list, which is what lets the host
 *           keep only the reading and writing: it holds the configuration, the account store and
 *           the app home, and asks this class what any of it means.
 */
public final class EndpointRules {
    private EndpointRules() {
    }

    /** The characters an endpoint id may use, checked one at a time so no regex engine is needed. */
    private static boolean isIdCharacter(char c) {
        return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                || c == '.' || c == '_' || c == '-';
    }

    private static boolean isIdentifier(String id) {
        for (int i = 0; i < id.length(); i++) {
            if (!isIdCharacter(id.charAt(i))) return false;
        }
        return !id.isEmpty();
    }

    private static String trimmed(String value) {
        return value == null ? "" : value.trim();
    }

    private static boolean isSchemeCharacter(char c, boolean first) {
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) return true;
        if (first) return false;
        return (c >= '0' && c <= '9') || c == '+' || c == '-' || c == '.';
    }

    /**
     * Why a base URL is unusable, or null when it is fine.
     *
     * @implNote Hand-rolled rather than {@code java.net.URI}, because this module is transpiled by
     *           TeaVM and stays clear of {@code java.net} entirely. It answers the same two
     *           questions the host's {@code URL} constructor did: does this parse as a URL at all,
     *           and is its scheme one this provider can speak over.
     */
    private static String baseUrlProblem(String baseUrl) {
        int colon = baseUrl.indexOf(':');
        if (colon <= 0) return "base URL is not a valid URL";
        for (int i = 0; i < colon; i++) {
            if (!isSchemeCharacter(baseUrl.charAt(i), i == 0)) return "base URL is not a valid URL";
        }
        String scheme = baseUrl.substring(0, colon).toLowerCase();
        if (!"http".equals(scheme) && !"https".equals(scheme)) return "base URL must be http or https";
        String rest = baseUrl.substring(colon + 1);
        if (!rest.startsWith("//") || rest.length() <= 2) return "base URL is not a valid URL";
        return null;
    }

    /**
     * Why an endpoint would not work, applied wherever one is added.
     *
     * @param candidate the endpoint being added or replaced
     * @param existing the endpoints already configured, which a duplicate id would collide with
     * @param rejectDuplicate whether an id already in {@code existing} is a problem, which it is
     *                        when adding and is not when replacing
     * @param allowedFormats the wire formats a translator is actually installed for
     * @return the reason it would not work, or null when it would
     */
    public static String validate(Endpoint candidate, List<Endpoint> existing, boolean rejectDuplicate,
                                  List<String> allowedFormats) {
        String id = trimmed(candidate == null ? null : candidate.id);
        if (id.isEmpty()) return "endpoint id is required";
        if (!isIdentifier(id)) return "endpoint id may only use letters, numbers, dot, dash and underscore";
        if (rejectDuplicate && existing != null) {
            for (Endpoint e : existing) {
                if (id.equals(e.id)) return "there is already an endpoint called " + id;
            }
        }
        if (trimmed(candidate.label).isEmpty()) return "label is required";
        String baseUrl = trimmed(candidate.baseUrl);
        if (baseUrl.isEmpty()) return "base URL is required";
        String urlProblem = baseUrlProblem(baseUrl);
        if (urlProblem != null) return urlProblem;
        if (allowedFormats == null || !allowedFormats.contains(candidate.format == null ? "" : candidate.format)) {
            return "unsupported wire format: " + candidate.format;
        }
        // An endpoint with no models advertises nothing, so it is a provider that can never serve.
        if (candidate.models == null || candidate.models.isEmpty()) return "at least one model id is required";
        return null;
    }

    /**
     * The endpoint list with one added or replaced, matched by id.
     *
     * @param existing the endpoints already configured
     * @param endpoint the endpoint to add, or to replace the one sharing its id
     * @return a new list; the input is never mutated
     */
    public static List<Endpoint> upsert(List<Endpoint> existing, Endpoint endpoint) {
        List<Endpoint> next = new ArrayList<Endpoint>();
        boolean replaced = false;
        if (existing != null) {
            for (Endpoint e : existing) {
                if (e.id.equals(endpoint.id)) {
                    next.add(endpoint);
                    replaced = true;
                } else {
                    next.add(e);
                }
            }
        }
        if (!replaced) next.add(endpoint);
        return next;
    }

    /**
     * The endpoint list without the one named.
     *
     * @param existing the endpoints already configured
     * @param id the endpoint id to drop
     * @return a new list; the input is never mutated
     */
    public static List<Endpoint> remove(List<Endpoint> existing, String id) {
        List<Endpoint> next = new ArrayList<Endpoint>();
        if (existing != null) {
            for (Endpoint e : existing) {
                if (!e.id.equals(id)) next.add(e);
            }
        }
        return next;
    }

    /**
     * Every model these endpoints advertise, each namespaced by the endpoint offering it.
     *
     * @param endpoints the endpoints already configured
     * @return the namespaced {@code <endpointId>/<model>} ids, in configuration order
     */
    public static List<String> advertisedModels(List<Endpoint> endpoints) {
        List<String> out = new ArrayList<String>();
        if (endpoints == null) return out;
        for (Endpoint e : endpoints) {
            if (e.models == null) continue;
            for (String model : e.models) out.add(e.id + "/" + model);
        }
        return out;
    }

    /**
     * Every advertised model with the name a surface shows for it.
     *
     * @param endpoints the endpoints already configured
     * @return namespaced model id to display name, {@code <endpoint label> / <upstream model>}
     */
    public static Map<String, String> displayNames(List<Endpoint> endpoints) {
        Map<String, String> out = new LinkedHashMap<String, String>();
        if (endpoints == null) return out;
        for (Endpoint e : endpoints) {
            if (e.models == null) continue;
            String label = e.label == null || e.label.isEmpty() ? e.id : e.label;
            for (String model : e.models) out.put(e.id + "/" + model, label + " / " + model);
        }
        return out;
    }
}
