/**
 * SVG sanitiser — the upload security boundary.
 *
 * The bar these tests hold: after sanitising, the output must contain no
 * executable content, no external reference, and no way to reach either. It
 * is not enough that a payload was "removed"; the artwork must also survive,
 * because a sanitiser that empties every file is trivially safe and useless.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { sanitiseSvg, SvgRejected, MAX_SVG_BYTES } from "@/lib/design/svg/sanitise";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "svg");
const fixture = (name: string) => readFileSync(join(FIXTURES, `${name}.svg`), "utf8");

const DANGEROUS_ELEMENTS = new Set([
  "script", "foreignobject", "iframe", "use", "image", "style", "a",
  "animate", "set", "filter", "mask", "pattern", "text",
]);

/**
 * Assertions that must hold for ANY sanitiser output.
 *
 * This inspects STRUCTURE, not raw text. An escaped `&quot; onload=&quot;`
 * sitting inside an attribute value is inert — a browser reads it as data,
 * never as an attribute — so a substring scan would fail the sanitiser for
 * doing exactly the right thing. What actually matters is that no dangerous
 * element or live attribute exists in the emitted tree.
 */
function assertInert(svg: string) {
  // Structural: no dangerous elements survived.
  for (const [, name] of svg.matchAll(/<\/?([A-Za-z][\w:-]*)/g)) {
    assert.ok(
      !DANGEROUS_ELEMENTS.has(name.toLowerCase()),
      `sanitised output still contains a <${name}> element:\n${svg}`,
    );
  }

  // Structural: no live attribute is an event handler or an external ref.
  for (const [, name, value] of svg.matchAll(/([A-Za-z][\w:.-]*)\s*=\s*"([^"]*)"/g)) {
    const n = name.toLowerCase();
    assert.ok(!n.startsWith("on"), `live event handler survived: ${n}="${value}"`);
    assert.ok(
      n !== "href" && !n.endsWith(":href") && !n.startsWith("xlink:"),
      `external reference survived: ${n}="${value}"`,
    );
    // Values are emitted escaped, so anything live would have to appear here
    // unescaped to execute.
    const v = value.toLowerCase();
    assert.ok(!v.includes("javascript:"), `javascript: URL survived in ${n}`);
    assert.ok(!v.includes("url("), `url() reference survived in ${n}`);
  }

  // Textual, but only for constructs that can never legitimately appear.
  const lower = svg.toLowerCase();
  for (const banned of ["<!doctype", "<!entity", "<![cdata[", "@import"]) {
    assert.ok(!lower.includes(banned), `sanitised output still contains ${banned}:\n${svg}`);
  }
  // Script bodies are text nodes; we emit no text nodes at all, so any
  // surviving script source would have to sit between tags.
  for (const [, between] of svg.matchAll(/>([^<]+)</g)) {
    assert.equal(
      between.trim(),
      "",
      `sanitised output emitted a text node: ${JSON.stringify(between)}`,
    );
  }
}

describe("malicious SVGs come out inert", () => {
  it("strips <script> and its contents but keeps the artwork", () => {
    const out = sanitiseSvg(fixture("malicious-script"));
    assertInert(out.svg);
    // The legitimate path must survive — a sanitiser that nukes everything
    // would pass the inertness check while being useless.
    assert.equal(out.shapeCount, 1);
    assert.ok(out.svg.includes("M10 10 H 90 V 90 H 10 Z"));
  });

  it("strips every event handler, including on the root element", () => {
    const out = sanitiseSvg(fixture("malicious-onload"));
    assertInert(out.svg);
    assert.equal(out.shapeCount, 2, "path + circle should survive");
  });

  it("rejects DOCTYPE/ENTITY outright rather than trying to clean it", () => {
    // XXE is not something to sanitise around — refuse the document.
    assert.throws(
      () => sanitiseSvg(fixture("malicious-xxe")),
      (e: unknown) =>
        e instanceof SvgRejected && e.code === "forbidden_content",
    );
  });

  it("drops <foreignObject> together with its whole subtree", () => {
    const out = sanitiseSvg(fixture("malicious-foreignobject"));
    assertInert(out.svg);
    // Critically: dropping only the tag would have promoted the <script>
    // inside it up into the output.
    assert.equal(out.shapeCount, 1);
  });

  it("removes external references (image/use/a href, url() fills)", () => {
    const out = sanitiseSvg(fixture("malicious-external-ref"));
    assertInert(out.svg);
    // The <a>-wrapped path is dropped with its subtree; the url()-filled path
    // survives as geometry but loses the external fill reference.
    assert.ok(out.shapeCount >= 1);
  });

  it("rejects CDATA blocks", () => {
    assert.throws(
      () => sanitiseSvg(fixture("malicious-cdata")),
      (e: unknown) =>
        e instanceof SvgRejected && e.code === "forbidden_content",
    );
  });
});

describe("adversarial inputs the fixtures don't cover", () => {
  it("does not let case variation smuggle a handler through", () => {
    const out = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" OnLoad="alert(1)"><PATH d="M0 0 H5 V5 H0 Z" fill="#000" ONCLICK="alert(2)"/></svg>`,
    );
    assertInert(out.svg);
    assert.equal(out.shapeCount, 1);
  });

  it("does not resolve entity-encoded payloads into live markup", () => {
    // &#106;avascript: would become javascript: if we decoded then trusted.
    const out = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0 H5 V5 H0 Z" fill="&#106;avascript:alert(1)"/></svg>`,
    );
    assertInert(out.svg);
  });

  it("re-escapes quotes so an attribute cannot break out of its own value", () => {
    const out = sanitiseSvg(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d='M0 0 H5 V5 H0 Z" onload="alert(1)' fill="#000"/></svg>`,
    );
    assertInert(out.svg);
    assert.ok(out.svg.includes("&quot;"), "the quote should be escaped, not emitted raw");
  });

  it("rejects a file that isn't an SVG at all", () => {
    assert.throws(
      () => sanitiseSvg("just some text"),
      (e: unknown) => e instanceof SvgRejected && e.code === "not_svg",
    );
  });

  it("rejects a file over the 2 MB cap", () => {
    const huge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">${" ".repeat(MAX_SVG_BYTES)}</svg>`;
    assert.throws(
      () => sanitiseSvg(huge),
      (e: unknown) => e instanceof SvgRejected && e.code === "too_large",
    );
  });

  it("rejects an SVG with no drawable shapes with actionable advice", () => {
    assert.throws(
      () =>
        sanitiseSvg(
          `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="0" y="5">ACME</text></svg>`,
        ),
      (e: unknown) => {
        assert.ok(e instanceof SvgRejected);
        assert.equal(e.code, "empty");
        // Text-as-logo is the single most common real upload mistake, so the
        // message must say what to do about it.
        assert.match(e.friendly, /outlines/i);
        return true;
      },
    );
  });

  it("accepts a well-formed small-brand logo unchanged in substance", () => {
    const out = sanitiseSvg(fixture("logo-simple"));
    assertInert(out.svg);
    assert.equal(out.shapeCount, 1);
    assert.deepEqual(out.viewBox, [0, 0, 100, 100]);
  });

  it("is idempotent — sanitising its own output changes nothing", () => {
    const once = sanitiseSvg(fixture("malicious-onload"));
    const twice = sanitiseSvg(once.svg);
    assert.equal(twice.svg, once.svg);
  });

  it("keeps every mark of a multi-path logo", () => {
    const out = sanitiseSvg(fixture("logo-multipath"));
    assert.equal(out.shapeCount, 3);
    assert.deepEqual(out.viewBox, [0, 0, 300, 100]);
  });

  it("preserves fill-rule so counters stay as holes", () => {
    const out = sanitiseSvg(fixture("logo-counters"));
    assert.equal(out.shapeCount, 2);
    assert.ok(
      out.svg.includes('fill-rule="evenodd"'),
      "dropping fill-rule would fill in the counters of an O or an A",
    );
  });
});
