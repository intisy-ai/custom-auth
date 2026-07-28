// core's build (tsc --noEmit + esbuild bundle) ships no declaration file for its dist.
// @ts-ignore
import { defineConfig } from "../core/dist/index.js";
import { listAccounts, addAccount } from "../core-auth/dist/index.js";
import { HandleIrError } from "./errors.js";

export type Endpoint = { id: string; label: string; baseUrl: string; format: string; models: string[] };

export function readEndpoints(): Endpoint[] {
  const cfg = defineConfig("custom-auth", { endpoints: [] }) as { endpoints?: Endpoint[] };
  return Array.isArray(cfg.endpoints) ? cfg.endpoints : [];
}

export function splitModel(model: string): { endpointId: string; upstreamModel: string } {
  const slash = model.indexOf("/");
  if (slash < 0) throw new HandleIrError({ status: 400, body: "custom-auth: model must be <endpointId>/<model>, got: " + model });
  return { endpointId: model.slice(0, slash), upstreamModel: model.slice(slash + 1) };
}

export function keyFor(endpointId: string): string {
  const accounts = listAccounts("custom", undefined) as Array<{ enabled?: boolean; refresh?: string; meta?: { endpointId?: string } }>;
  const account = accounts.find((a) => a.enabled !== false && a.meta?.endpointId === endpointId);
  if (!account?.refresh) throw new HandleIrError({ status: 401, body: "custom-auth: no API key configured for endpoint " + endpointId });
  return account.refresh;
}

export function resolveEndpoint(model: string): { endpointId: string; upstreamModel: string; endpoint: Endpoint; apiKey: string } {
  const { endpointId, upstreamModel } = splitModel(model);
  const endpoint = readEndpoints().find((e) => e.id === endpointId);
  if (!endpoint) throw new HandleIrError({ status: 400, body: "custom-auth: unknown endpoint " + endpointId });
  return { endpointId, upstreamModel, endpoint, apiKey: keyFor(endpointId) };
}

export function advertisedModels(): string[] {
  return readEndpoints().flatMap((e) => e.models.map((m) => e.id + "/" + m));
}

// Seeds the key into core-auth's account store (accounts.json), never into config/custom-auth.json.
export function saveKey(endpointId: string, key: string): void {
  addAccount("custom", { id: endpointId, refresh: key, enabled: true, meta: { endpointId } }, undefined);
}
