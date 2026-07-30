/**
 * Builder rejections that are written for the user must reach the user.
 *
 * These messages are the whole point of the validation gates — "use a face of
 * at least 66 mm, or shorten the URL" is actionable; "these settings produced
 * an invalid model" is not. The mapping collapsed every 422 to the generic
 * string once already, silently, and nothing caught it until the app was
 * driven by hand.
 */
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { __testing } from "@/lib/design/pyapi";

const { friendly } = __testing;

/** How FastAPI serialises HTTPException(422, "..."). */
const detail = (text: string) => JSON.stringify({ detail: text });

describe("builder errors surfaced to the user", () => {
  it("passes through a too-dense QR with its suggested face size", () => {
    const msg = friendly(
      422,
      detail(
        "invalid_params: qr_too_dense: this address needs 41 modules, which works out at 1.46 mm each on a 60 mm face — under the 1.6 mm a printer can hold. Use a face of at least 66 mm, or shorten the URL with a link shortener.",
      ),
    );
    assert.match(msg, /at least 66 mm/);
    assert.match(msg, /shorten the URL/);
    assert.ok(!msg.startsWith("invalid_params"), "the code should be stripped");
  });

  it("passes through the https-only message", () => {
    const msg = friendly(422, detail("invalid_params: url_not_https: use an https:// address — phones increasingly refuse plain http links."));
    assert.match(msg, /https:\/\/ address/);
  });

  it("passes through cut-through advice naming the culprit letters", () => {
    const msg = friendly(
      422,
      detail(
        "invalid_params: cut_through_splits_tag: cutting through would break this tag into 2 loose pieces. Letters like A, O and R have enclosed centres that drop out when cut through — switch to emboss or deboss, or remove the text.",
      ),
    );
    assert.match(msg, /A, O and R/);
    assert.match(msg, /emboss or deboss/);
  });

  it("does NOT leak internal validator text", () => {
    // These are unreachable through the UI and read like a stack trace.
    for (const raw of [
      "invalid_params: widthMm=99 out of range [30, 60]",
      "invalid_params: unknown icon 'heart'",
      "invalid_params: text contains disallowed characters",
      "invalid_params: unknown keys foo, bar",
    ]) {
      assert.equal(
        friendly(422, detail(raw)),
        "These settings produced an invalid model.",
        `should not surface: ${raw}`,
      );
    }
  });

  it("keeps the dedicated slice-failure message", () => {
    const msg = friendly(422, JSON.stringify({ error: "slice_failed", message: "slice_failed" }));
    assert.match(msg, /can't be printed reliably/);
  });

  it("falls back gracefully on a non-JSON or unexpected body", () => {
    assert.equal(friendly(422, "<html>502</html>"), "These settings produced an invalid model.");
    assert.match(friendly(500, "boom"), /had a problem/);
    assert.match(friendly(503, ""), /had a problem/);
  });
});
