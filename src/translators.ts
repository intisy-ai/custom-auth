import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IrRequest, IrResponse, IrStreamEvent } from "@intisy-ai/core-ir";

// A translator speaks one vendor's wire format. Described structurally rather than as the type
// of a particular translator: this plugin vendors none, so no vendor is more canonical here
// than any other.
export interface WireTranslator {
  encodeRequest: (request: IrRequest) => Promise<string> | string;
  decodeResponse: (body: string) => Promise<IrResponse> | IrResponse;
  decodeStream: () => Promise<TransformStream<Uint8Array, IrStreamEvent>>;
}

const SCOPE = "@intisy-ai";
const SUFFIX = "-translator";

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

// Every translator installed into this home's shared library store. This plugin vendors none:
// Cairn installs a translator as an ordinary marketplace entry, it lands in the same store a
// provider resolves its libraries from, and discovery is a directory read rather than a
// registry this plugin would have to keep in step. A home with none speaks no wire format
// yet, which the host reports as "install a translator" rather than a broken endpoint.
export async function loadTranslators(configDir: string): Promise<Record<string, WireTranslator>> {
  if (cache && cache.dir === configDir) return cache.translators;

  const translators: Record<string, WireTranslator> = {};
  const store = join(configDir, "node_modules", SCOPE);
  if (existsSync(store)) {
    for (const entry of readdirSync(store, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const format = formatOf(entry.name);
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
