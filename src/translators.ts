import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { IrRequest, IrResponse, IrStreamEvent } from "@intisy-ai/basekit/ir";

/**
 * One vendor's wire format, in both directions.
 *
 * @remarks
 * Described structurally rather than as the type of a particular translator: this plugin vendors
 * none, so no vendor is more canonical here than any other.
 */
export interface WireTranslator {
  /** Encodes a canonical-IR request into this vendor's wire body. */
  encodeRequest: (request: IrRequest) => Promise<string> | string;
  /** Decodes this vendor's wire response back into canonical IR. */
  decodeResponse: (body: string) => Promise<IrResponse> | IrResponse;
  /** A stream that turns this vendor's wire events into canonical-IR events. */
  decodeStream: () => Promise<TransformStream<Uint8Array, IrStreamEvent>>;
}

const SCOPE = "@intisy-ai";
const SUFFIX = "-translator";

let cache: { dir: string; translators: Record<string, WireTranslator> } | null = null;

/** Forgets which translators are installed, so a test can point at a different home. */
export function resetTranslatorCacheForTests(): void {
  cache = null;
}

/**
 * The wire format a translator package speaks, `<vendor>-translator` speaking `<vendor>`.
 *
 * @remarks
 * Derived rather than declared, so a translator published later needs no entry anywhere here.
 *
 * @param packageName - the installed package's name, scoped or bare
 * @returns the vendor name, or null when the package is not a translator
 */
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

/**
 * Every translator installed into this home's shared library store, by the format it speaks.
 *
 * @remarks
 * This plugin vendors none. A translator is installed as an ordinary marketplace entry, lands in the
 * same store a provider resolves its libraries from, and is discovered by reading that directory
 * rather than from a registry this plugin would have to keep in step. A home with none speaks no
 * wire format yet, which the host reports as "install a translator" rather than a broken endpoint.
 *
 * @param configDir - the app home to look in
 * @returns the installed translators, keyed by wire format
 */
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

/**
 * The wire formats this home can actually speak.
 *
 * @param configDir - the app home to look in
 * @returns the formats a translator is installed for, sorted
 */
export async function supportedFormats(configDir: string): Promise<string[]> {
  return Object.keys(await loadTranslators(configDir)).sort();
}
