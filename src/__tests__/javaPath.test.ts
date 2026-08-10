import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installTranslator } from "./installTranslator.js";

function seedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "custom-auth-java-"));
  const cfg = join(home, "config");
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints: [{ id: "local", label: "Local", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o"] }] }));
  writeFileSync(join(cfg, "accounts.json"), JSON.stringify({ version: 1, providers: { custom: { accounts: [{ id: "local", refresh: "sk-test-key", enabled: true, meta: { endpointId: "local" } }], activeIndex: 0, activeIndexByLane: {} } } }));
  installTranslator(home);
  return home;
}

// The Java path is endpoint RESOLUTION in Java plus translation through the installed
// translator. Encode/decode parity with a vendor's Java is that translator repo's own concern
// now: this plugin binds no vendor at build time and has none to compare against.
describe("custom-auth handleIr (Java path, HUB_CUSTOM_AUTH_JAVA_HANDLE=1)", () => {
  afterEach(() => {
    delete process.env.HUB_CUSTOM_AUTH_JAVA_HANDLE;
  });

  it("resolves + encodes via java/custom and decodes the upstream response back to IR", async () => {
    process.env.HUB_CONFIG_DIR = seedHome();
    process.env.HUB_CUSTOM_AUTH_JAVA_HANDLE = "1";
    const fetchStub = vi.fn(async () => new Response(JSON.stringify({
      id: "chatcmpl-1", model: "gpt-4o",
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "hi there" } }],
      usage: { prompt_tokens: 3, completion_tokens: 2 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const { handleIr } = await import("../driver.js");
    const ir = { model: "local/gpt-4o", messages: [{ role: "user", content: [{ kind: "text", text: "hi" }] }], stream: false } as never;
    const result = await handleIr(ir, { configDir: process.env.HUB_CONFIG_DIR!, log: () => {}, model: "local/gpt-4o" }, { fetch: fetchStub } as never);

    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchStub.mock.calls[0];
    expect(String(url)).toContain("https://ep.test/v1");
    expect((opts as { headers: Record<string, string> }).headers.Authorization).toBe("Bearer sk-test-key");
    const body = JSON.parse((opts as { body: string }).body);
    expect(body.model).toBe("gpt-4o");
    expect((result as { content: unknown }).content).toBeDefined();
  });

  it("throws a duck-typed HandleIrError for an unknown endpoint", async () => {
    process.env.HUB_CONFIG_DIR = seedHome();
    process.env.HUB_CUSTOM_AUTH_JAVA_HANDLE = "1";
    const { handleIr } = await import("../driver.js");
    const ir = { model: "ghost/gpt-4o", messages: [], stream: false } as never;
    await expect(handleIr(ir, { configDir: process.env.HUB_CONFIG_DIR!, log: () => {}, model: "ghost/gpt-4o" }, { fetch: vi.fn() } as never))
      .rejects.toMatchObject({ name: "HandleIrError", status: 400 });
  });
});
