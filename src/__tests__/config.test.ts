import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function seed(endpoints: unknown[]): string {
  const home = mkdtempSync(join(tmpdir(), "custom-auth-cfg-"));
  const cfg = join(home, "config"); mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints }));
  return home;
}

describe("custom-auth config + key seeding", () => {
  it("advertises endpoint-namespaced models and stores the key via core-auth (not in config)", async () => {
    process.env.HUB_CONFIG_DIR = seed([
      { id: "a", label: "A", baseUrl: "https://a/v1", format: "openai", models: ["m1", "m2"] },
      { id: "b", label: "B", baseUrl: "https://b/v1", format: "openai", models: ["x"] },
    ]);
    const { advertisedModels, saveKey } = await import("../endpoints.js");
    expect(new Set(advertisedModels())).toEqual(new Set(["a/m1", "a/m2", "b/x"]));

    saveKey("a", "sk-secret");
    const { keyFor } = await import("../endpoints.js");
    expect(keyFor("a")).toBe("sk-secret");
    const cfgText = readFileSync(join(process.env.HUB_CONFIG_DIR!, "config", "custom-auth.json"), "utf8");
    expect(cfgText).not.toContain("sk-secret"); // key is in accounts.json (core-auth), never config
  });
});
