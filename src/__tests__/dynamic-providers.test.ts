import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ENDPOINTS = [
  { id: "local", label: "Local", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o", "gpt-4o-mini"] },
  { id: "corp", label: "Corp", baseUrl: "https://corp.test/v1", format: "openai", models: ["big"] },
];

function seedHome(accounts: Record<string, unknown> = {}): string {
  const home = mkdtempSync(join(tmpdir(), "custom-auth-dyn-"));
  const cfg = join(home, "config");
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints: ENDPOINTS }));
  writeFileSync(join(cfg, "accounts.json"), JSON.stringify({ version: 1, providers: accounts }));
  process.env.HUB_CONFIG_DIR = home;
  return home;
}

describe("resolveProviders: one first-class provider per endpoint", () => {
  it("returns a provider per endpoint, each pooled by its own id with its raw models", async () => {
    vi.resetModules();
    seedHome();
    const { resolveProviders } = await import("../driver.js");
    const providers = resolveProviders();
    expect(providers.map((p) => p.id)).toEqual(["local", "corp"]);
    expect(providers.every((p) => p.accountPool === p.id)).toBe(true);
    expect(Object.keys(providers[0].models)).toEqual(["gpt-4o", "gpt-4o-mini"]);
    expect(providers.every((p) => p.hasOAuth === false)).toBe(true);
  });

  it("returns [] when no endpoints are configured", async () => {
    vi.resetModules();
    const home = mkdtempSync(join(tmpdir(), "custom-auth-dyn-"));
    const cfg = join(home, "config");
    mkdirSync(cfg, { recursive: true });
    writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints: [] }));
    process.env.HUB_CONFIG_DIR = home;
    const { resolveProviders } = await import("../driver.js");
    expect(resolveProviders()).toEqual([]);
  });
});

describe("buildDynamicManifest / writeDynamicManifest", () => {
  it("builds one manifest entry per endpoint in the loader's readDynamicProviders shape", async () => {
    vi.resetModules();
    seedHome();
    const { buildDynamicManifest } = await import("../endpoints.js");
    expect(buildDynamicManifest()).toEqual([
      { name: "local", handler: "dist/handler.js", translator: "custom", accountPool: "local" },
      { name: "corp", handler: "dist/handler.js", translator: "custom", accountPool: "corp" },
    ]);
  });

  it("writes .dynamic-providers.json to the given repo dir", async () => {
    vi.resetModules();
    seedHome();
    const repoDir = mkdtempSync(join(tmpdir(), "custom-auth-repo-"));
    const { writeDynamicManifest } = await import("../endpoints.js");
    writeDynamicManifest(repoDir);
    const written = JSON.parse(readFileSync(join(repoDir, ".dynamic-providers.json"), "utf-8"));
    expect(written.map((e: { name: string }) => e.name)).toEqual(["local", "corp"]);
  });
});

describe("keyFor / migrateLegacyKeys: per-endpoint pools with a legacy fallback", () => {
  it("reads a key stored under the endpoint's own pool", async () => {
    vi.resetModules();
    seedHome({ local: { accounts: [{ id: "local", refresh: "sk-own", enabled: true }], activeIndex: 0, activeIndexByLane: {} } });
    const { keyFor } = await import("../endpoints.js");
    expect(keyFor("local")).toBe("sk-own");
  });

  it("falls back to a legacy custom-pool key tagged with the endpoint id", async () => {
    vi.resetModules();
    seedHome({ custom: { accounts: [{ id: "local", refresh: "sk-legacy", enabled: true, meta: { endpointId: "local" } }], activeIndex: 0, activeIndexByLane: {} } });
    const { keyFor } = await import("../endpoints.js");
    expect(keyFor("local")).toBe("sk-legacy");
  });

  it("migrateLegacyKeys moves custom-pool keys into their per-endpoint pool", async () => {
    vi.resetModules();
    seedHome({ custom: { accounts: [{ id: "local", refresh: "sk-legacy", enabled: true, meta: { endpointId: "local" } }], activeIndex: 0, activeIndexByLane: {} } });
    const { migrateLegacyKeys, keyFor } = await import("../endpoints.js");
    const { listAccounts } = await import("@intisy-ai/core-auth");
    migrateLegacyKeys();
    expect((listAccounts("local", undefined) as Array<{ refresh?: string }>).some((a) => a.refresh === "sk-legacy")).toBe(true);
    expect(listAccounts("custom", undefined)).toHaveLength(0);
    expect(keyFor("local")).toBe("sk-legacy");
  });
});

describe("handleIr resolves the endpoint from ctx.provider + raw model", () => {
  it("serves the raw model under the endpoint named by the provider id", async () => {
    vi.resetModules();
    seedHome({ local: { accounts: [{ id: "local", refresh: "sk-own", enabled: true }], activeIndex: 0, activeIndexByLane: {} } });
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl-1", model: "gpt-4o",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "ok" } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const { handleIr } = await import("../driver.js");
    const ir = { model: "gpt-4o", messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }], stream: false } as never;
    await handleIr(ir, { configDir: process.env.HUB_CONFIG_DIR!, log: () => {}, model: "gpt-4o", provider: "local" }, { fetch: fetchStub } as never);
    const [url, opts] = fetchStub.mock.calls[0];
    expect(String(url)).toContain("https://ep.test/v1");
    expect((opts as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer sk-own");
    expect(JSON.parse((opts as { body: string }).body).model).toBe("gpt-4o");
  });
});
