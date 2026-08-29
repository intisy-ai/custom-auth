import { describe, it, expect, beforeEach } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatOf, loadTranslators, resetTranslatorCacheForTests, supportedFormats } from "./translators.js";

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "custom-auth-translators-"));
  resetTranslatorCacheForTests();
});

// Writes a translator into the home's shared store the way installing one does.
function installTranslator(name: string, exportName = "translator"): void {
  const dir = join(home, "node_modules", "@intisy-ai", name, "dist");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "index.js"),
    `export const ${exportName} = {
      encodeRequest: async (r) => r,
      decodeResponse: async (r) => r,
      decodeStream: async () => new TransformStream(),
    };\n`,
  );
}

describe("formatOf", () => {
  it("reads the vendor out of a translator package name", () => {
    expect(formatOf("@intisy-ai/gemini-translator")).toBe("gemini");
    expect(formatOf("openai-translator")).toBe("openai");
  });

  it("ignores a package that is not a translator", () => {
    expect(formatOf("@intisy-ai/basekit/auth")).toBeNull();
    expect(formatOf("@intisy-ai/-translator")).toBeNull();
  });
});

describe("loadTranslators", () => {
  // The plugin vendors no translator, so a home with none installed speaks nothing. The host
  // turns that into "install a translator" rather than offering a format that cannot work.
  it("speaks no format at all with nothing installed", async () => {
    expect(await supportedFormats(home)).toEqual([]);
  });

  // The point of the whole change: a translator published after this plugin shipped is usable
  // without changing this plugin.
  it("picks up a translator it has never heard of", async () => {
    installTranslator("gemini-translator");
    expect(await supportedFormats(home)).toEqual(["gemini"]);
    expect((await loadTranslators(home)).gemini).toBeTruthy();
  });

  it("speaks every installed translator, with no vendor privileged over another", async () => {
    installTranslator("gemini-translator");
    installTranslator("openai-translator");
    installTranslator("anthropic-translator");
    expect(await supportedFormats(home)).toEqual(["anthropic", "gemini", "openai"]);
  });

  it("finds the translator by its shape, not by what the export is called", async () => {
    installTranslator("anthropic-translator", "anthropicWireThing");
    expect(await supportedFormats(home)).toContain("anthropic");
  });

  it("ignores a store entry that is not a translator", async () => {
    mkdirSync(join(home, "node_modules", "@intisy-ai", "core-auth", "dist"), { recursive: true });
    writeFileSync(join(home, "node_modules", "@intisy-ai", "core-auth", "dist", "index.js"), "export const addAccount = () => {};\n");
    expect(await supportedFormats(home)).toEqual([]);
  });

  // A broken translator must cost only the formats it would have added.
  it("keeps the other formats when one translator fails to load", async () => {
    installTranslator("gemini-translator");
    const broken = join(home, "node_modules", "@intisy-ai", "broken-translator", "dist");
    mkdirSync(broken, { recursive: true });
    writeFileSync(join(broken, "index.js"), "this is not javascript {");

    expect(await supportedFormats(home)).toEqual(["gemini"]);
  });
});
