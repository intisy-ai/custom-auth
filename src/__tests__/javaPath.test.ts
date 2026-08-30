import { describe, it, expect, vi } from "vitest";
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

// Resolution is the transpiled Java's decision and translation is the installed translator's, so
// what these assert is the seam between them: the endpoint the Java picked is the one called, with
// the upstream model it un-namespaced, and a resolve failure crosses back as a typed error.
describe("custom-auth handleIr, resolving through the transpiled java", () => {
  it("calls the endpoint the java resolved, with the model it un-namespaced", async () => {
    process.env.HUB_CONFIG_DIR = seedHome();
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
    const { handleIr } = await import("../driver.js");
    const ir = { model: "ghost/gpt-4o", messages: [], stream: false } as never;
    await expect(handleIr(ir, { configDir: process.env.HUB_CONFIG_DIR!, log: () => {}, model: "ghost/gpt-4o" }, { fetch: vi.fn() } as never))
      .rejects.toMatchObject({ name: "HandleIrError", status: 400 });
  });
});
