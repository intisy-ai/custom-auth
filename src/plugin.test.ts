import { beforeEach, describe, expect, it, vi } from "vitest";
import { providerSupport } from "@intisy-ai/basekit/auth";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string;

beforeEach(() => {
  vi.resetModules();
  home = mkdtempSync(join(tmpdir(), "custom-auth-plugin-"));
  process.env.HUB_CONFIG_DIR = home;
});

// The host's own service, which is where the provider helpers come from now. A test supplies the
// real one, so what it exercises is what a loader hands over rather than a stand-in for it.
function contextSpy(services: Record<string, unknown> = { "provider-support": providerSupport() }) {
  const provided: Record<string, unknown> = {};
  return {
    provided,
    context: {
      provide: vi.fn((key: string | { id: string }, value: unknown) => { provided[typeof key === "string" ? key : key.id] = value; }),
      // The engine mints a typed key from an id alone, which is all the plugin needs from it here.
      capability: (id: string) => ({ id }),
      service: (id: string) => ({ id }),
      services: { get: (key: { id: string }) => services[key.id] },
      paths: { home },
    },
  };
}

async function activate() {
  const plugin = (await import("./plugin.js")).default;
  const { context, provided } = contextSpy();
  await plugin.activate(context as never);
  return { plugin, provided };
}

describe("the custom-auth api plugin", () => {
  it("provides exactly the capabilities its manifest declares", async () => {
    const { provided } = await activate();
    expect(Object.keys(provided).sort()).toEqual(["custom-endpoints", "provider", "settings"]);
  });

  it("advertises only its own lane when no endpoint is configured", async () => {
    const { provided } = await activate();
    const lanes = await (provided.provider as { providers: () => Promise<Array<{ id: string }>> }).providers();
    expect(lanes.map((lane) => lane.id)).toEqual(["custom"]);
  });

  it("answers an empty endpoint list when no endpoint is configured", async () => {
    const { provided } = await activate();
    await expect((provided["custom-endpoints"] as { endpoints: () => Promise<unknown[]> }).endpoints()).resolves.toEqual([]);
  });

  it("advertises one lane per configured endpoint, after its own", async () => {
    const { setConfigValue } = await import("@intisy-ai/basekit");
    setConfigValue("custom-auth", "endpoints", [
      { id: "mine", label: "Mine", baseUrl: "https://api.example.com/v1", format: "openai", models: ["m"] },
    ]);
    const { provided } = await activate();
    type Lane = { id: string; label: string; models: Record<string, { name: string }>; hasOAuth: boolean; accountPool: string; translator?: string };
    const lanes = await (provided.provider as { providers: () => Promise<Lane[]> }).providers();
    expect(lanes.map((lane) => lane.id)).toEqual(["custom", "mine"]);
    expect(lanes[1]).toEqual({
      id: "mine",
      label: "Mine",
      models: { m: { name: "m" } },
      hasOAuth: false,
      accountPool: "mine",
      translator: "custom",
    });
  });

  it("deactivates without throwing", async () => {
    const { plugin } = await activate();
    expect(plugin.deactivate()).toBeUndefined();
  });
});

describe("writeDynamicManifest", () => {
  it("writes the home's cache file, keyed by this plugin's id", async () => {
    const { setConfigValue } = await import("@intisy-ai/basekit");
    setConfigValue("custom-auth", "endpoints", [
      { id: "mine", label: "Mine", baseUrl: "https://api.example.com/v1", format: "openai", models: ["m"] },
    ]);
    const { writeDynamicManifest } = await import("./endpoints.js");
    writeDynamicManifest();
    const at = join(home, "cache", "dynamic-providers.json");
    expect(existsSync(at)).toBe(true);
    expect(JSON.parse(readFileSync(at, "utf8"))).toEqual({
      "custom-auth": [{ name: "mine", repo: "custom-auth", handler: "dist/handler.js", translator: "custom", accountPool: "mine" }],
    });
  });

  it("writes an empty list rather than removing the key when the last endpoint goes", async () => {
    const { writeDynamicManifest } = await import("./endpoints.js");
    writeDynamicManifest();
    expect(JSON.parse(readFileSync(join(home, "cache", "dynamic-providers.json"), "utf8"))).toEqual({ "custom-auth": [] });
  });

  it("leaves another plugin's lanes untouched", async () => {
    const { mkdirSync, writeFileSync } = await import("node:fs");
    mkdirSync(join(home, "cache"), { recursive: true });
    writeFileSync(
      join(home, "cache", "dynamic-providers.json"),
      JSON.stringify({ "other-plugin": [{ name: "theirs", repo: "other-plugin", handler: "dist/handler.js" }] }),
      "utf8",
    );
    const { writeDynamicManifest } = await import("./endpoints.js");
    writeDynamicManifest();
    const parsed = JSON.parse(readFileSync(join(home, "cache", "dynamic-providers.json"), "utf8"));
    expect(parsed["other-plugin"]).toHaveLength(1);
    expect(parsed["custom-auth"]).toEqual([]);
  });

  // A host that offers no provider support cannot run a provider at all, and naming the service is
  // the only way an operator learns which host is at fault.
  it("names the missing service rather than leaving the capability unprovided", async () => {
    const plugin = (await import("./plugin.js")).default;
    const { context } = contextSpy({});
    await expect(async () => plugin.activate(context as never)).rejects.toThrow(/provider-support/);
  });
});
