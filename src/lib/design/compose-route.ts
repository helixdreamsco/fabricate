/**
 * Where a composer submission goes, given what the user actually brought.
 *
 * The awkward case is a photo with words. Image-to-3D can't take both: its
 * only text input is `texture_prompt`, which guides texture, and we never
 * texture (FDM prints one colour). So words next to a photo have to meet it
 * at the concept-image stage — image-to-image edits the photo per the
 * description, and the approved result becomes the geometry.
 *
 * Extracted from the component because "which combination goes where" is
 * the part that silently rots, and a React state machine is a bad place to
 * assert against.
 */

/** Below this a prompt is treated as empty — matches the API's min(3). */
export const MIN_PROMPT_CHARS = 3;

export type ComposerRoute =
  /** Photo + words → image-to-image concept → approve → image-to-3D. */
  | "concept-from-photo"
  /** Photo alone, or a generator with no concept stage → image-to-3D. */
  | "image-to-3d"
  /** Words alone, no concept stage (demo generator) → text-to-3D. */
  | "text-to-3d"
  /** Words alone → clarifying questions → concept → approve → 3D. */
  | "clarify"
  /** Nothing usable was supplied. */
  | "nothing";

export function routeComposerSubmit({
  hasPhoto,
  prompt,
  conceptImagesAvailable,
}: {
  hasPhoto: boolean;
  prompt: string;
  /** False for the built-in demo generator, which has no image stage. */
  conceptImagesAvailable: boolean;
}): ComposerRoute {
  const described = prompt.trim().length >= MIN_PROMPT_CHARS;

  if (hasPhoto) {
    // Words only reach the result through the concept stage. Without it
    // they cannot influence anything, so the photo goes on alone rather
    // than the text being accepted and quietly dropped.
    if (described && conceptImagesAvailable) return "concept-from-photo";
    return "image-to-3d";
  }
  if (!described) return "nothing";
  return conceptImagesAvailable ? "clarify" : "text-to-3d";
}
