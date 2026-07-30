/**
 * Resolve hook: `@/x` → `<repo>/src/x`, and extensionless relative imports →
 * `.ts` / `.tsx` / `/index.ts`. See resolver.mjs for why this exists.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

/** First existing candidate for a path that may be missing its extension. */
function withExtension(absPath) {
  if (existsSync(absPath) && !absPath.endsWith("/")) return absPath;
  for (const ext of EXTENSIONS) {
    if (existsSync(absPath + ext)) return absPath + ext;
  }
  for (const ext of EXTENSIONS) {
    const indexed = resolvePath(absPath, `index${ext}`);
    if (existsSync(indexed)) return indexed;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // `@/lib/foo` → `<repo>/src/lib/foo`
  if (specifier.startsWith("@/")) {
    const hit = withExtension(resolvePath(REPO_ROOT, "src", specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  // Relative import missing its extension — resolve against the importer.
  if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
    const parentDir = dirname(fileURLToPath(context.parentURL));
    const hit = withExtension(resolvePath(parentDir, specifier));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
