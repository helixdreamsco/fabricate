import fs from "node:fs";
import path from "node:path";
import { templateSpecSchema, type TemplateSpec } from "./schema";

// Template specs are the single source of truth shared with the Python
// service (api/app/design reads the same JSONs to validate + build).
const TEMPLATES_DIR = path.join(process.cwd(), "design", "templates");

let cache: Map<string, TemplateSpec> | null = null;

export function allTemplates(): TemplateSpec[] {
  if (!cache) {
    cache = new Map();
    for (const file of fs.readdirSync(TEMPLATES_DIR).sort()) {
      if (!file.endsWith(".json")) continue;
      const spec = templateSpecSchema.parse(
        JSON.parse(fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf8")),
      );
      cache.set(spec.id, spec);
    }
  }
  return [...cache.values()];
}

export function getTemplate(id: string): TemplateSpec | undefined {
  allTemplates();
  return cache!.get(id);
}
