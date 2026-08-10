import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../..", import.meta.url));

// This plugin vendors no translator, so a home speaks nothing until one is installed. Tests
// that exercise a wire format have to install one the same way Cairn does: drop its built dist
// into the home's shared library store.
export function installTranslator(home: string, vendor = "openai"): void {
  const target = join(home, "node_modules", "@intisy-ai", `${vendor}-translator`);
  mkdirSync(target, { recursive: true });
  cpSync(join(REPO, `${vendor}-translator`, "dist"), join(target, "dist"), { recursive: true });
}
