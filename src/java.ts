import * as custom from "./generated/custom-provider.teavm.js";
import type { ProviderDescriptor } from "@intisy-ai/basekit/auth";
import type { Endpoint } from "./endpoints.js";
import { HandleIrError } from "./errors.js";

/**
 * The seam onto this provider's transpiled Java, which owns every decision about a configured
 * endpoint.
 *
 * @remarks
 * Statically imported rather than loaded on demand, because the bundle is inlined into each
 * deployed entry anyway (223 KB inside a 274 KB `dist/driver.js`, measured 2026-08-30), so
 * deferring it saves no bytes and would force three host-facing functions that must answer
 * synchronously to become promises.
 *
 * Values cross as JSON text, which is the shape the endpoint list is already configured in.
 */

/** One resolved request: which endpoint serves it, and as which upstream model. */
export interface Resolution {
  /** The endpoint's id. */
  endpointId: string;
  /** The model id to send upstream. */
  upstreamModel: string;
  /** The endpoint itself, as configured. */
  endpoint: Endpoint;
}

/** What crosses back when the Java throws instead of answering. */
interface ErrorEnvelope {
  /** Present only on a failure, carrying the status and body the host reconstructs a response from. */
  error?: { status: number; body: string };
}

/**
 * Resolves which configured endpoint serves a request.
 *
 * @param endpoints - the endpoints already configured
 * @param model - the model the request names
 * @param provider - the resolved provider id naming an endpoint directly, when there is one
 * @returns the endpoint and the model to send upstream
 * @throws HandleIrError when no configured endpoint answers
 */
export function resolveEndpoint(endpoints: Endpoint[], model: string, provider?: string): Resolution {
  const parsed = JSON.parse(
    custom.resolveEndpoint(JSON.stringify(endpoints), model, provider ?? null),
  ) as Resolution & ErrorEnvelope;
  if (parsed.error) throw new HandleIrError({ status: parsed.error.status, body: parsed.error.body });
  return parsed;
}

/**
 * Why an endpoint would not work.
 *
 * @param endpoints - the endpoints already configured
 * @param candidate - the endpoint being added or replaced
 * @param rejectDuplicate - whether an id already configured is a problem
 * @param formats - the wire formats a translator is actually installed for
 * @returns the reason it would not work, or null when it would
 */
export function validateEndpoint(
  endpoints: Endpoint[],
  candidate: Partial<Endpoint>,
  rejectDuplicate: boolean,
  formats: readonly string[],
): string | null {
  const { problem } = JSON.parse(
    custom.validateEndpoint(
      JSON.stringify(endpoints),
      JSON.stringify(candidate),
      rejectDuplicate,
      JSON.stringify(formats),
    ),
  ) as { problem: string | null };
  return problem;
}

/**
 * The endpoint list with one added or replaced, matched by id.
 *
 * @param endpoints - the endpoints already configured
 * @param endpoint - the endpoint to add, or to replace the one sharing its id
 * @returns the resulting list
 */
export function upsertEndpoint(endpoints: Endpoint[], endpoint: Endpoint): Endpoint[] {
  return JSON.parse(custom.upsertEndpoint(JSON.stringify(endpoints), JSON.stringify(endpoint))) as Endpoint[];
}

/**
 * The endpoint list without the one named.
 *
 * @param endpoints - the endpoints already configured
 * @param id - the endpoint id to drop
 * @returns the resulting list
 */
export function removeEndpoint(endpoints: Endpoint[], id: string): Endpoint[] {
  return JSON.parse(custom.removeEndpoint(JSON.stringify(endpoints), id)) as Endpoint[];
}

/**
 * Every advertised model with the name a surface shows for it.
 *
 * @param endpoints - the endpoints already configured
 * @returns namespaced model id to display name
 */
export function displayNames(endpoints: Endpoint[]): Record<string, string> {
  return JSON.parse(custom.displayNames(JSON.stringify(endpoints))) as Record<string, string>;
}

/** One routable lane, in the shape a host's provider scan reads out of the app home. */
export interface ManifestLane {
  /** The lane's name, which is the endpoint's id. */
  name: string;
  /** The plugin the lane belongs to. */
  repo: string;
  /** The bundle a host loads to serve a request on this lane. */
  handler: string;
  /** The translator name the lane is filed under. */
  translator: string;
  /** The account pool the lane's API key lives in. */
  accountPool: string;
}

/**
 * The lanes a host's provider scan reads out of the app home's dynamic manifest.
 *
 * @param endpoints - the endpoints already configured
 * @returns one entry per endpoint, in configuration order
 */
export function dynamicManifest(endpoints: Endpoint[]): ManifestLane[] {
  return JSON.parse(custom.dynamicManifest(JSON.stringify(endpoints))) as ManifestLane[];
}

/**
 * The lanes an in-process host asks the provider capability for.
 *
 * @param endpoints - the endpoints already configured
 * @returns one provider descriptor per endpoint, in configuration order
 */
export function providerDescriptors(endpoints: Endpoint[]): ProviderDescriptor[] {
  return JSON.parse(custom.providerDescriptors(JSON.stringify(endpoints))) as ProviderDescriptor[];
}
