/**
 * Flatten 3MF "production extension" files so three's ThreeMFLoader can read
 * them.
 *
 * Bambu Studio, Orca and PrusaSlicer don't put the mesh in `3D/3dmodel.model`.
 * They leave a container there whose objects are components pointing into
 * separate parts:
 *
 *     <object id="2" type="model">
 *       <components>
 *         <component p:path="/3D/Objects/object_13.model" objectid="1"/>
 *       </components>
 *     </object>
 *
 * That `p:path` is the production extension. ThreeMFLoader resolves
 * `objectid` only within the model part it is currently building, ignores
 * the path, finds no object with that id, and dies — which surfaced to users
 * as "Could not read that file. Try re-exporting it from your CAD app." on a
 * file that is perfectly valid. Every Bambu export hits this.
 *
 * The fix is to rewrite the archive before the loader sees it: copy the
 * referenced objects into the root model with fresh ids and drop the path
 * attribute, so what reaches the loader is an ordinary single-part 3MF.
 *
 * Nothing here changes geometry — only which file the elements live in.
 */
import { unzipSync, zipSync, strFromU8, strToU8 } from "fflate";

/** Local name of an attribute, ignoring whatever prefix the writer chose. */
function localName(attr: Attr): string {
  return attr.name.includes(":") ? attr.name.split(":").pop()! : attr.name;
}

function getAttrByLocalName(el: Element, name: string): Attr | null {
  for (let i = 0; i < el.attributes.length; i++) {
    const attr = el.attributes[i];
    if (localName(attr) === name) return attr;
  }
  return null;
}

/** Normalise "/3D/Objects/x.model" and "3D/Objects/x.model" to a zip key. */
function zipKey(path: string): string {
  return path.replace(/^\/+/, "");
}

/**
 * True when the archive uses cross-part component references. Cheap enough to
 * run on every 3MF, and lets untouched files take the original code path.
 */
export function usesProductionExtension(zip: Record<string, Uint8Array>): boolean {
  for (const [name, bytes] of Object.entries(zip)) {
    if (!/^3D\/.*\.model$/i.test(name)) continue;
    // A path attribute on a component is the whole signal; matching loosely on
    // the attribute name avoids depending on the `p:` prefix a writer picked.
    if (/<component\b[^>]*\bp?[\w-]*:?path\s*=/i.test(strFromU8(bytes))) return true;
  }
  return false;
}

export function rootModelName(zip: Record<string, Uint8Array>): string | null {
  // The package rels name the start part; fall back to the conventional path.
  const rels = Object.keys(zip).find((n) => /^_rels\/\.rels$/i.test(n));
  if (rels) {
    const target = strFromU8(zip[rels]).match(
      /<Relationship\b[^>]*Type="[^"]*\/3dmodel"[^>]*>/i,
    );
    const path = target?.[0].match(/Target="([^"]+)"/i)?.[1];
    if (path && zip[zipKey(path)]) return zipKey(path);
  }
  const conventional = Object.keys(zip).find(
    (n) => n.toLowerCase() === "3d/3dmodel.model",
  );
  return conventional ?? null;
}

/**
 * Rewrite `data` so all geometry lives in the root model part.
 *
 * Returns the original buffer untouched when the file doesn't use the
 * extension, or when anything about it looks unexpected — a best-effort
 * rewrite must never make a readable file unreadable.
 */
export function flattenProductionExtension(data: ArrayBuffer): ArrayBuffer {
  let zip: Record<string, Uint8Array>;
  try {
    zip = unzipSync(new Uint8Array(data));
  } catch {
    return data; // not a zip; let the loader produce its own error
  }
  if (!usesProductionExtension(zip)) return data;

  const rootName = rootModelName(zip);
  if (!rootName) return data;

  const parser = new DOMParser();
  const rootDoc = parser.parseFromString(strFromU8(zip[rootName]), "application/xml");
  const rootResources = rootDoc.querySelector("resources");
  if (!rootResources || rootDoc.querySelector("parsererror")) return data;

  // Highest id already in use, so copied objects can be numbered above it.
  let nextId = 0;
  rootDoc.querySelectorAll("object").forEach((o) => {
    nextId = Math.max(nextId, Number(o.getAttribute("id") ?? 0) || 0);
  });

  const partDocs = new Map<string, Document>();
  const loadPart = (key: string): Document | null => {
    if (partDocs.has(key)) return partDocs.get(key)!;
    if (!zip[key]) return null;
    const doc = parser.parseFromString(strFromU8(zip[key]), "application/xml");
    if (doc.querySelector("parsererror")) return null;
    partDocs.set(key, doc);
    return doc;
  };

  /** Copied objects, keyed by "<part>#<original id>" so shared parts are
   *  imported once rather than duplicated per reference. */
  const imported = new Map<string, string>();

  const importObject = (partKey: string, objectId: string, depth: number): string | null => {
    if (depth > 8) return null;                       // cycle guard
    const cacheKey = `${partKey}#${objectId}`;
    const already = imported.get(cacheKey);
    if (already) return already;

    const doc = loadPart(partKey);
    if (!doc) return null;
    const source = Array.from(doc.querySelectorAll("object")).find(
      (o) => o.getAttribute("id") === objectId,
    );
    if (!source) return null;

    const newId = String(++nextId);
    // Reserve the id before recursing so a self-reference terminates.
    imported.set(cacheKey, newId);

    const copy = rootDoc.importNode(source, true) as Element;
    copy.setAttribute("id", newId);

    // The copied object may itself reference other parts, or objects within
    // its own part — both need resolving relative to where it came from.
    for (const component of Array.from(copy.querySelectorAll("component"))) {
      const pathAttr = getAttrByLocalName(component, "path");
      const childPart = pathAttr ? zipKey(pathAttr.value) : partKey;
      const childId = component.getAttribute("objectid");
      if (!childId) continue;
      const mapped = importObject(childPart, childId, depth + 1);
      if (mapped) {
        component.setAttribute("objectid", mapped);
        if (pathAttr) component.removeAttribute(pathAttr.name);
      }
    }

    rootResources.appendChild(copy);
    return newId;
  };

  let rewrote = false;
  for (const component of Array.from(rootDoc.querySelectorAll("component"))) {
    const pathAttr = getAttrByLocalName(component, "path");
    if (!pathAttr) continue;
    const objectId = component.getAttribute("objectid");
    if (!objectId) continue;
    const mapped = importObject(zipKey(pathAttr.value), objectId, 0);
    if (!mapped) continue;
    component.setAttribute("objectid", mapped);
    component.removeAttribute(pathAttr.name);
    rewrote = true;
  }
  if (!rewrote) return data;

  const out: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(zip)) out[name] = bytes;
  out[rootName] = strToU8(new XMLSerializer().serializeToString(rootDoc));

  const rezipped = zipSync(out);
  // Copy out of the possibly-pooled buffer fflate returns.
  return rezipped.buffer.slice(
    rezipped.byteOffset,
    rezipped.byteOffset + rezipped.byteLength,
  ) as ArrayBuffer;
}
