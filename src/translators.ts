import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { openaiTranslator } from "@intisy-ai/openai-translator";

// A translator speaks one vendor's wire format. Only the encode/decode surface is used here,
// so anything exporting it can be registered without this plugin knowing the vendor.
export type WireTranslator = typeof openaiTranslator;

const SCOPE = "@intisy-ai";
const SUFFIX = "-translator";

// The translator this plugin vendors as a submodule. It is the floor, not the list: a home
// with no shared store still speaks OpenAI, and everything found there adds to it.
const BUNDLED: Record<string, WireTranslator> = { openai: openaiTranslator };

let cache: { dir: string; translators: Record<string, WireTranslator> } | null = null;

export function resetTranslatorCacheForTests(): void {
  cache = null;
}

// Package name -> wire format: `<vendor>-translator` speaks `<vendor>`. Derived rather than
// declared so a translator published later needs no entry anywhere in this plugin.
export function formatOf(packageName: string): string | null {
  const bare = packageName.startsWith(`${SCOPE}/`) ? packageName.slice(SCOPE.length + 1) : packageName;
  if (!bare.endsWith(SUFFIX)) return null;
  const vendor = bare.slice(0, -SUFFIX.length);
  return vendor.length > 0 ? vendor : null;
}

function isTranslator(value: unknown): value is WireTranslator {
  const candidate = value as { encodeRequest?: unknown; decodeResponse?: unknown } | null;
  return !!candidate && typeof candidate === "object" && typeof candidate.encodeRequest === "function";
}

// The vendor export is named for its vendor (openaiTranslator), so the shape is what is
// looked for rather than the name: a translator that names its export differently still works.
function translatorFrom(module: Record<string, unknown>): WireTranslator | null {
  for (const value of Object.values(module)) {
    if (isTranslator(value)) return value;
  }
  return null;
}

// Every translator installed into this home's shared library store, plus the bundled one.
// Cairn installs a translator as an ordinary marketplace entry, and it lands in the same store
// a provider resolves its libraries from, so discovery is a directory read rather than a
// registry this plugin would have to keep in step.
export async function loadTranslators(configDir: string): Promise<Record<string, WireTranslator>> {
  if (cache && cache.dir === configDir) return cache.translators;

  const translators: Record<string, WireTranslator> = { ...BUNDLED };
  const store = join(configDir, "node_modules", SCOPE);
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const format = formatOf(entry.name);
      // The bundled copy is already loaded and is the same code; re-importing it would only
      // create a second module instance.
      if (!format || translators[format]) continue;
      try {
        const module = (await import(pathToFileURL(join(store, entry.name, "dist", "index.js")).href)) as Record<string, unknown>;
        const translator = translatorFrom(module);
        if (translator) translators[format] = translator;
      } catch {
        // A translator that fails to load leaves the formats it would have added absent, which
        // the caller reports as an unsupported format rather than crashing the provider.
      }
    }
  }

  cache = { dir: configDir, translators };
  return translators;
}

export async function supportedFormats(configDir: string): Promise<string[]> {
  return Object.keys(await loadTranslators(configDir)).sort();
}
