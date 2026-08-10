import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installTranslator } from "./installTranslator.js";

function seedHome(): string {
  const home = mkdtempSync(join(tmpdir(), "custom-auth-stream-"));
  const cfg = join(home, "config"); mkdirSync(cfg, { recursive: true });
  writeFileSync(join(cfg, "custom-auth.json"), JSON.stringify({ endpoints: [{ id: "local", label: "L", baseUrl: "https://ep.test/v1", format: "openai", models: ["gpt-4o"] }] }));
  writeFileSync(join(cfg, "accounts.json"), JSON.stringify({ version: 1, providers: { custom: { accounts: [{ id: "local", refresh: "sk", enabled: true, meta: { endpointId: "local" } }], activeIndex: 0, activeIndexByLane: {} } } }));
  installTranslator(home);
  return home;
}
function sseBody(): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const frames = [
    'data: {"choices":[{"delta":{"role":"assistant","content":"Hel"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\n',
    "data: [DONE]\n\n",
  ];
  return new ReadableStream({ start(c) { for (const f of frames) c.enqueue(enc.encode(f)); c.close(); } });
}

describe("custom-auth handleIr (openai, streaming)", () => {
  it("pipes the upstream SSE through the translator into IR events", async () => {
    process.env.HUB_CONFIG_DIR = seedHome();
    const fetchStub = vi.fn(async () => new Response(sseBody(), { status: 200, headers: { "content-type": "text/event-stream" } }));
    const { handleIr } = await import("../driver.js");
    const ir = { model: "local/gpt-4o", messages: [], stream: true } as never;
    const out = await handleIr(ir, { configDir: process.env.HUB_CONFIG_DIR!, log: () => {}, model: "local/gpt-4o" }, { fetch: fetchStub } as never);
    expect(out).toBeInstanceOf(ReadableStream);
    const events: unknown[] = [];
    const reader = (out as ReadableStream).getReader();
    for (;;) { const { done, value } = await reader.read(); if (done) break; events.push(value); }
    expect(events.length).toBeGreaterThan(0);
    expect(JSON.stringify(events)).toContain("Hel");
    expect(JSON.stringify(events)).toContain("lo");
  });
});
