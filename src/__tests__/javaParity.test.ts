import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openaiTranslator } from "../../openai-translator/dist/index.js";

// Frozen fixture: byte-identical to java/custom's CustomHandleIrTest.EXPECTED_WIRE_BODY. Both
// sides encode the SAME IrRequest shape through openai-translator's Java (openaiTranslator here
// wraps the same OpenaiRequestCodec.encodeRequest that java/custom's CustomHandleIr.prepareRequest
// calls directly), so this asserts the TS driver and the new Java module never drift. A deliberate
// change to OpenaiRequestCodec's encode shape must update both fixtures together.
const EXPECTED_WIRE_BODY =
  '{"model":"llama-3.1-70b","messages":[{"role":"user","content":[{"type":"text","text":"Hello, custom endpoint!"}]}],"stream":false}';

describe("custom-auth <-> java/custom parity", () => {
  it("openai-translator's TS-side encode matches java/custom's frozen fixture", async () => {
    const ir = {
      model: "llama-3.1-70b",
      stream: false,
      messages: [{ role: "user", content: [{ kind: "text", text: "Hello, custom endpoint!" }] }],
    } as never;
    const wireBody = await openaiTranslator.encodeRequest(ir);
    expect(wireBody).toBe(EXPECTED_WIRE_BODY);
  });
});

function seedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "custom-auth-java-"));
  const cfg = join(home, "config");
  mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints: [{ id: "local", label: "Local", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o"] }] }));
  writeFileSync(join(cfg, "accounts.json"), JSON.stringify({ version: 1, providers: { custom: { accounts: [{ id: "local", refresh: "sk-test-key", enabled: true, meta: { endpointId: "local" } }], activeIndex: 0, activeIndexByLane: {} } } }));
  return home;
}

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
