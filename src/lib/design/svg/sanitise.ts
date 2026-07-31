/**
 * SVG sanitiser for user-uploaded brand logos.
 *
 * SVG is an XSS vector: it can carry <script>, event handlers, external
 * references, and XXE payloads. This module is the boundary — nothing
 * upstream may store or serve a logo that hasn't been through it.
 *
 * The strategy is PARSE AND REBUILD, not strip. We tokenise the input, keep
 * only elements and attributes on an explicit allowlist, and then emit a
 * brand-new document from the surviving nodes with every value re-escaped.
 * The output can therefore only ever contain markup we constructed
 * ourselves — a payload cannot survive by hiding in syntax the sanitiser
 * failed to recognise, which is the usual way regex-based SVG scrubbers get
 * bypassed. Anything we cannot parse confidently is a rejection, not a
 * best-effort clean.
 */

export type SvgRejectCode =
  | "not_svg"
  | "too_large"
  | "malformed"
  | "forbidden_content"
  | "too_complex"
  | "empty";

export class SvgRejected extends Error {
  // Declared as fields rather than constructor parameter properties: the
  // test runner strips types without transforming, and parameter properties
  // need a real transform.
  code: SvgRejectCode;
  /** Safe to show the user. */
  friendly: string;

  constructor(code: SvgRejectCode, friendly: string) {
    super(`${code}: ${friendly}`);
    this.code = code;
    this.friendly = friendly;
  }
}

export const MAX_SVG_BYTES = 2 * 1024 * 1024; // 2 MB per the brief
/** Guards the geometry stage: each path becomes booleans downstream. */
export const MAX_PATH_COUNT = 1500;
const MAX_NODES = 20_000;
const MAX_DEPTH = 64;

/** Shape + container elements we can render. Everything else is dropped. */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "title",
  "desc",
]);

/**
 * Elements whose entire subtree must go, not just the element. Dropping only
 * the tag would promote its children (e.g. a <script> inside <defs>).
 */
const DROP_SUBTREE = new Set([
  "script",
  "foreignobject",
  "image",
  "use",
  "a",
  "style",
  "filter",
  "mask",
  "pattern",
  "marker",
  "clippath",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "switch",
  "symbol",
  "defs",
  "text",
  "textpath",
  "tspan",
  "metadata",
]);

const COMMON_ATTRS = new Set([
  "transform",
  "fill",
  "fill-rule",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "stroke-dasharray",
  "stroke-opacity",
  "opacity",
  "clip-rule",
]);

const ELEMENT_ATTRS: Record<string, Set<string>> = {
  svg: new Set(["viewbox", "width", "height", "xmlns", "version", ...COMMON_ATTRS]),
  g: COMMON_ATTRS,
  path: new Set(["d", ...COMMON_ATTRS]),
  rect: new Set(["x", "y", "width", "height", "rx", "ry", ...COMMON_ATTRS]),
  circle: new Set(["cx", "cy", "r", ...COMMON_ATTRS]),
  ellipse: new Set(["cx", "cy", "rx", "ry", ...COMMON_ATTRS]),
  line: new Set(["x1", "y1", "x2", "y2", ...COMMON_ATTRS]),
  polyline: new Set(["points", ...COMMON_ATTRS]),
  polygon: new Set(["points", ...COMMON_ATTRS]),
  title: new Set<string>(),
  desc: new Set<string>(),
};

// ---------------------------------------------------------------------------
// Tokeniser
// ---------------------------------------------------------------------------

export type SvgNode = {
  name: string;
  attrs: Record<string, string>;
  children: SvgNode[];
};

type Token =
  | { type: "open"; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { type: "close"; name: string }
  | { type: "text"; value: string };

const NAME_RE = /[A-Za-z_][A-Za-z0-9_.:-]*/y;

function decodeEntities(raw: string): string {
  // Only the five XML predefined entities plus numeric refs are honoured.
  // A custom entity reference means a DTD was involved — reject rather than
  // resolve, since that is the XXE path.
  return raw.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);?/g, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      const code = Number.parseInt(body.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    if (body.startsWith("#")) {
      const code = Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : "";
    }
    switch (body) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return '"';
      case "apos": return "'";
      default:
        throw new SvgRejected(
          "forbidden_content",
          "This SVG uses custom entities, which we don't accept. Re-export it from your design tool.",
        );
    }
  });
}

function tokenise(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let nodeCount = 0;

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt === -1) break;
    if (lt > i) {
      const text = src.slice(i, lt);
      if (text.trim()) tokens.push({ type: "text", value: text });
    }

    // Comments, CDATA, DOCTYPE, processing instructions.
    if (src.startsWith("<!--", lt)) {
      const end = src.indexOf("-->", lt + 4);
      if (end === -1) throw new SvgRejected("malformed", "This SVG file is malformed.");
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", lt)) {
      // CDATA is how script bodies smuggle markup past naive scrubbers. We
      // have no element that legitimately needs it.
      throw new SvgRejected(
        "forbidden_content",
        "This SVG contains embedded data blocks we can't accept.",
      );
    }
    if (src.startsWith("<!", lt)) {
      // DOCTYPE / ENTITY declarations — the XXE vector.
      throw new SvgRejected(
        "forbidden_content",
        "This SVG contains a document type declaration, which we don't accept. Re-export it from your design tool.",
      );
    }
    if (src.startsWith("<?", lt)) {
      const end = src.indexOf("?>", lt + 2);
      if (end === -1) throw new SvgRejected("malformed", "This SVG file is malformed.");
      i = end + 2;
      continue;
    }

    if (++nodeCount > MAX_NODES) {
      throw new SvgRejected(
        "too_complex",
        "This logo has too many shapes to print cleanly. Try a simplified version.",
      );
    }

    // Closing tag.
    if (src.startsWith("</", lt)) {
      NAME_RE.lastIndex = lt + 2;
      const m = NAME_RE.exec(src);
      if (!m) throw new SvgRejected("malformed", "This SVG file is malformed.");
      const gt = src.indexOf(">", NAME_RE.lastIndex);
      if (gt === -1) throw new SvgRejected("malformed", "This SVG file is malformed.");
      tokens.push({ type: "close", name: m[0].toLowerCase() });
      i = gt + 1;
      continue;
    }

    // Opening tag.
    NAME_RE.lastIndex = lt + 1;
    const nameMatch = NAME_RE.exec(src);
    if (!nameMatch) throw new SvgRejected("malformed", "This SVG file is malformed.");
    const name = nameMatch[0].toLowerCase();
    let j = NAME_RE.lastIndex;
    const attrs: Record<string, string> = {};

    for (;;) {
      while (j < src.length && /\s/.test(src[j])) j++;
      if (j >= src.length) throw new SvgRejected("malformed", "This SVG file is malformed.");
      if (src[j] === ">") { j++; break; }
      if (src.startsWith("/>", j)) { j += 2; tokens.push({ type: "open", name, attrs, selfClosing: true }); i = j; break; }

      NAME_RE.lastIndex = j;
      const attrMatch = NAME_RE.exec(src);
      if (!attrMatch || attrMatch.index !== j) {
        throw new SvgRejected("malformed", "This SVG file is malformed.");
      }
      const attrName = attrMatch[0].toLowerCase();
      j = NAME_RE.lastIndex;
      while (j < src.length && /\s/.test(src[j])) j++;
      let value = "";
      if (src[j] === "=") {
        j++;
        while (j < src.length && /\s/.test(src[j])) j++;
        const quote = src[j];
        if (quote !== '"' && quote !== "'") {
          throw new SvgRejected("malformed", "This SVG file is malformed.");
        }
        const end = src.indexOf(quote, j + 1);
        if (end === -1) throw new SvgRejected("malformed", "This SVG file is malformed.");
        value = decodeEntities(src.slice(j + 1, end));
        j = end + 1;
      }
      attrs[attrName] = value;
    }

    if (i !== j) {
      tokens.push({ type: "open", name, attrs, selfClosing: false });
      i = j;
    }
  }
  return tokens;
}

// ---------------------------------------------------------------------------
// Allowlist filtering
// ---------------------------------------------------------------------------

/**
 * Gradient and pattern fills, rewritten to an inert token.
 *
 * `fill="url(#brand-gradient)"` points into a <defs> subtree we drop, so the
 * reference is dead either way. But throwing the attribute away loses the
 * information that this shape is painted *differently from its neighbours* —
 * and that difference is the entire design in a layered logo. Keeping a
 * token preserves the identity for the geometry stage while removing the
 * reference: `paint-brand-gradient` fetches nothing and executes nothing.
 */
function rewritePaintReference(value: string): string | null {
  const match = value.trim().match(/^url\(\s*['"]?#([A-Za-z][\w.:-]*)['"]?\s*\)$/);
  return match ? `paint-${match[1]}` : null;
}

/** Attribute values that reference anything outside the document. */
function valueIsSafe(name: string, value: string): boolean {
  const v = value.trim().toLowerCase();
  if (!v) return true;
  // url(http…) is an external fetch. Same-document url(#id) is handled
  // earlier by rewritePaintReference; anything still carrying url( here is
  // either external or malformed.
  if (v.includes("url(")) return false;
  if (v.includes("javascript:") || v.includes("data:") || v.includes("&#")) return false;
  if (v.includes("<") || v.includes(">")) return false;
  // Belt and braces: expression() is an ancient IE CSS vector.
  if (v.includes("expression(")) return false;
  if (name === "transform" && !/^[-+0-9a-z.,()\s%]*$/i.test(v)) return false;
  return true;
}

function buildTree(tokens: Token[]): SvgNode {
  const root: SvgNode = { name: "#root", attrs: {}, children: [] };
  const stack: SvgNode[] = [root];
  /** Depth of the nearest dropped ancestor, or 0 when not inside one. */
  let droppedDepth = 0;

  for (const token of tokens) {
    if (token.type === "text" || token.type === "close") {
      if (token.type === "close") {
        if (droppedDepth > 0) {
          droppedDepth--;
          continue;
        }
        if (stack.length > 1) stack.pop();
      }
      continue;
    }

    if (droppedDepth > 0) {
      if (!token.selfClosing) droppedDepth++;
      continue;
    }

    if (DROP_SUBTREE.has(token.name)) {
      // Drop the element AND everything under it.
      if (!token.selfClosing) droppedDepth = 1;
      continue;
    }

    if (!ALLOWED_ELEMENTS.has(token.name)) {
      // Unknown element: drop the tag but keep walking, so an unrecognised
      // wrapper doesn't discard the artwork inside it.
      continue;
    }

    if (stack.length > MAX_DEPTH) {
      throw new SvgRejected("too_complex", "This logo is nested too deeply to process.");
    }

    const allowed = ELEMENT_ATTRS[token.name] ?? new Set<string>();
    const attrs: Record<string, string> = {};
    for (const [rawName, rawValue] of Object.entries(token.attrs)) {
      // Event handlers and every namespaced reference go unconditionally.
      if (rawName.startsWith("on")) continue;
      if (rawName === "href" || rawName.endsWith(":href")) continue;
      if (rawName.startsWith("xlink:")) continue;
      if (!allowed.has(rawName)) continue;
      if (rawName === "fill" || rawName === "stroke") {
        const token = rewritePaintReference(rawValue);
        if (token) {
          attrs[rawName] = token;
          continue;
        }
      }
      if (!valueIsSafe(rawName, rawValue)) continue;
      attrs[rawName] = rawValue;
    }

    const node: SvgNode = { name: token.name, attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!token.selfClosing) stack.push(node);
  }

  return root;
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emit(node: SvgNode, out: string[]): void {
  if (node.name === "#root") {
    for (const child of node.children) emit(child, out);
    return;
  }
  // title/desc carry user text; we drop their content entirely rather than
  // reason about it, since neither affects geometry.
  if (node.name === "title" || node.name === "desc") return;

  const attrs = Object.entries(node.attrs)
    .map(([k, v]) => ` ${k}="${escapeAttr(v)}"`)
    .join("");
  if (!node.children.length) {
    out.push(`<${node.name}${attrs}/>`);
    return;
  }
  out.push(`<${node.name}${attrs}>`);
  for (const child of node.children) emit(child, out);
  out.push(`</${node.name}>`);
}

export type SanitisedSvg = {
  /** The only form of the artwork that may be stored or served. */
  svg: string;
  /** Root viewBox as [minX, minY, width, height]. */
  viewBox: [number, number, number, number];
  /** Count of drawable elements that survived. */
  shapeCount: number;
};

/**
 * Parse sanitised markup back into a node tree. Only safe on output of
 * `sanitiseSvg` — it reuses the same allowlist, so it cannot resurrect
 * anything that was dropped, but it is not a general-purpose parser.
 */
export function parseSanitised(svg: string): SvgNode {
  const root = buildTree(tokenise(svg));
  const el = root.children.find((c) => c.name === "svg");
  if (!el) throw new SvgRejected("not_svg", "That doesn't look like an SVG file.");
  return el;
}

function parseViewBox(root: SvgNode): [number, number, number, number] {
  const svg = root.children.find((c) => c.name === "svg");
  const raw = svg?.attrs["viewbox"];
  if (raw) {
    const nums = raw.trim().split(/[\s,]+/).map(Number);
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n)) && nums[2] > 0 && nums[3] > 0) {
      return [nums[0], nums[1], nums[2], nums[3]];
    }
  }
  // Fall back to width/height, then to a unit square — the geometry stage
  // normalises by the artwork's own bounds anyway.
  const w = Number.parseFloat(svg?.attrs["width"] ?? "");
  const h = Number.parseFloat(svg?.attrs["height"] ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return [0, 0, w, h];
  return [0, 0, 100, 100];
}

function countShapes(node: SvgNode): number {
  const drawable = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
  let n = drawable.has(node.name) ? 1 : 0;
  for (const child of node.children) n += countShapes(child);
  return n;
}

/**
 * Sanitise an uploaded SVG. Throws `SvgRejected` with a user-safe message on
 * anything we won't accept; otherwise returns markup built entirely from
 * allowlisted nodes.
 */
export function sanitiseSvg(input: string | Uint8Array): SanitisedSvg {
  const src =
    typeof input === "string" ? input : new TextDecoder("utf-8").decode(input);

  if (src.length > MAX_SVG_BYTES) {
    throw new SvgRejected("too_large", "That file is over 2 MB — please upload a smaller SVG.");
  }
  if (!/<svg[\s>]/i.test(src)) {
    throw new SvgRejected("not_svg", "That doesn't look like an SVG file.");
  }

  const root = buildTree(tokenise(src));
  const svgEl = root.children.find((c) => c.name === "svg");
  if (!svgEl) {
    throw new SvgRejected("not_svg", "That doesn't look like an SVG file.");
  }

  const shapeCount = countShapes(svgEl);
  if (shapeCount === 0) {
    throw new SvgRejected(
      "empty",
      "We couldn't find any shapes in that SVG. If your logo is made of text, convert it to outlines and re-export.",
    );
  }
  if (shapeCount > MAX_PATH_COUNT) {
    throw new SvgRejected(
      "too_complex",
      `This logo has ${shapeCount} shapes — more than we can print cleanly. Try a simplified version.`,
    );
  }

  const viewBox = parseViewBox(root);
  // Re-emit with a normalised root so the stored file is self-contained.
  svgEl.attrs["xmlns"] = "http://www.w3.org/2000/svg";
  svgEl.attrs["viewbox"] = viewBox.join(" ");
  delete svgEl.attrs["width"];
  delete svgEl.attrs["height"];

  const out: string[] = [];
  emit(svgEl, out);
  // Attribute names were lowercased during parsing; viewBox is the only one
  // whose casing SVG actually cares about.
  const svg = out.join("").replace(/\bviewbox=/g, "viewBox=");
  return { svg, viewBox, shapeCount };
}
