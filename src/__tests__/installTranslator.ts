import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// A translator that speaks the OpenAI wire shape, written to disk the way installing one puts it
// in a home's shared store. This plugin vendors no translator, so its own tests cannot borrow a
// real one: what they exercise is this plugin's orchestration (resolve, key, fetch, hand to the
// translator), and the vendor's encode/decode correctness is that translator repo's own tests.
// Only basekit/ir's IR shape is assumed here, nothing else.
const FAKE_TRANSLATOR = `
const decoder = new TextDecoder();

export const translator = {
  async encodeRequest(ir) {
    return JSON.stringify({ model: ir.model, messages: ir.messages, stream: !!ir.stream });
  },
  async decodeResponse(body) {
    const parsed = JSON.parse(body);
    const choice = (parsed.choices || [])[0] || {};
    return {
      model: parsed.model,
      content: [{ kind: "text", text: (choice.message || {}).content || "" }],
      stopReason: choice.finish_reason || null,
      usage: {
        inputTokens: (parsed.usage || {}).prompt_tokens || 0,
        outputTokens: (parsed.usage || {}).completion_tokens || 0,
      },
    };
  },
  async decodeStream() {
    let buffered = "";
    return new TransformStream({
      transform(chunk, controller) {
        buffered += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
        const lines = buffered.split("\\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === "[DONE]") continue;
          let parsed;
          try { parsed = JSON.parse(payload); } catch { continue; }
          const delta = ((parsed.choices || [])[0] || {}).delta || {};
          if (typeof delta.content === "string" && delta.content.length > 0) {
            controller.enqueue({ kind: "text-delta", text: delta.content });
          }
        }
      },
    });
  },
};
`;

export function installTranslator(home: string, vendor = "openai"): void {
  const dist = join(home, "node_modules", "@intisy-ai", `${vendor}-translator`, "dist");
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "index.js"), FAKE_TRANSLATOR, "utf8");
}
