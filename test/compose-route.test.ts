/**
 * Composer routing: photo, words, or both.
 *
 * The case worth guarding is a photo WITH words. Image-to-3D has no
 * geometry prompt, so if those submissions ever route straight there the
 * description is silently thrown away — which is exactly the bug this
 * replaced.
 *
 * Run: npm test
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { routeComposerSubmit, MIN_PROMPT_CHARS } from "@/lib/design/compose-route";

const route = (
  hasPhoto: boolean,
  prompt: string,
  conceptImagesAvailable = true,
) => routeComposerSubmit({ hasPhoto, prompt, conceptImagesAvailable });

describe("routeComposerSubmit", () => {
  it("sends a photo with words through the concept stage", () => {
    // Not image-to-3d: that endpoint would ignore every word of it.
    assert.equal(route(true, "make it a keyring"), "concept-from-photo");
  });

  it("sends a photo alone straight to image-to-3d", () => {
    assert.equal(route(true, ""), "image-to-3d");
    assert.equal(route(true, "   "), "image-to-3d");
  });

  it("sends words alone to the clarifying questions", () => {
    assert.equal(route(false, "low-poly fox figurine"), "clarify");
  });

  it("reports nothing to do when nothing was supplied", () => {
    assert.equal(route(false, ""), "nothing");
    assert.equal(route(false, "  \n "), "nothing");
    assert.equal(route(false, "", false), "nothing");
  });

  it("treats a too-short prompt as no prompt", () => {
    const short = "a".repeat(MIN_PROMPT_CHARS - 1);
    assert.equal(route(false, short), "nothing");
    // With a photo it must not become concept-from-photo on two characters.
    assert.equal(route(true, short), "image-to-3d");
    assert.equal(route(true, "a".repeat(MIN_PROMPT_CHARS)), "concept-from-photo");
  });

  describe("without a concept stage (demo generator)", () => {
    it("drops back to image-to-3d rather than pretending words count", () => {
      // There is nowhere for the text to be applied, so the photo goes
      // alone — and the composer tells the user that.
      assert.equal(route(true, "make it a keyring", false), "image-to-3d");
    });

    it("sends words alone straight to text-to-3d", () => {
      assert.equal(route(false, "low-poly fox figurine", false), "text-to-3d");
    });
  });

  it("never routes to a photo path without a photo", () => {
    for (const prompt of ["", "abc", "a longer description entirely"]) {
      for (const concept of [true, false]) {
        const r = route(false, prompt, concept);
        assert.notEqual(r, "concept-from-photo", `${prompt}/${concept}`);
        assert.notEqual(r, "image-to-3d", `${prompt}/${concept}`);
      }
    }
  });
});
