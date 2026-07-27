import Anthropic from "@anthropic-ai/sdk";
import { classifierAvailable } from "./classifier";

/**
 * Prompt clarification for the AI tab: ambiguous prompts get up to three
 * quick multiple-choice questions (style, subject detail, vibe) whose answers
 * are folded into the generation prompt, so the concept image — and the model
 * built from it — lands closer to what the user pictured.
 *
 * FAIL OPEN: this is UX sugar, not safety (moderation runs separately in the
 * concept/generate routes). Any error or unparseable output just means "no
 * questions" and the flow continues with the raw prompt.
 */

const SYSTEM = `You help users of a 3D-printing service refine prompts for a text-to-3D generator.
Given a prompt, decide whether it is SPECIFIC enough to generate a model the user will recognise
as what they meant, or AMBIGUOUS enough that quick clarifying questions would noticeably improve it.

If SPECIFIC, respond with exactly: SPECIFIC

If AMBIGUOUS, respond with 1-3 questions, one per line, each formatted exactly as:
Q: <short question> | <option 1> ; <option 2> ; <option 3> ; <option 4>

Rules for questions:
- 2-4 options each, every option a short phrase (2-5 words) that can be appended to the prompt verbatim.
- Ask only about visual properties that change the generated shape: style, pose, proportions,
  key features, level of detail. Never ask about size, colour, material or printing settings —
  those are chosen later.
- Options must be concrete and mutually exclusive. No "other", no "no preference".
- Never reference copyrighted characters or brands in questions or options.

Examples:
"a cute chunky dragon figurine sitting upright" -> SPECIFIC
"a dragon" ->
Q: What style of dragon? | chunky cartoon style ; realistic with detailed scales ; low-poly faceted ; cute baby dragon
Q: What pose? | sitting upright ; curled up sleeping ; wings spread mid-roar ; perched on rocks`;

export type ClarifyQuestion = { question: string; options: string[] };

/** Parse the one-line-per-question protocol. Exported for tests. */
export function parseQuestions(text: string): ClarifyQuestion[] {
  if (/^\s*SPECIFIC\b/i.test(text.trim())) return [];
  const questions: ClarifyQuestion[] = [];
  for (const line of text.split("\n")) {
    const match = line.match(/^Q:\s*([^|]+?)\s*\|\s*(.+)$/);
    if (!match) continue;
    const options = match[2]
      .split(";")
      .map((o) => o.trim())
      .filter((o) => o.length > 0 && o.length <= 60)
      .slice(0, 4);
    if (options.length >= 2) {
      questions.push({ question: match[1].trim(), options });
    }
  }
  return questions.slice(0, 3);
}

export type ClarifyTransport = (system: string, user: string) => Promise<string>;

const anthropicTransport: ClarifyTransport = async (system, user) => {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
};

export async function clarifyPrompt(
  prompt: string,
  transport: ClarifyTransport = anthropicTransport,
): Promise<ClarifyQuestion[]> {
  if (transport === anthropicTransport && !classifierAvailable()) return [];
  try {
    return parseQuestions(await transport(SYSTEM, `Prompt: ${JSON.stringify(prompt)}`));
  } catch (e) {
    console.error("design clarify error", e);
    return [];
  }
}

/** Fold chosen answers into the prompt the concept image / model is built from. */
export function composePrompt(prompt: string, answers: string[]): string {
  const clean = answers.map((a) => a.trim()).filter(Boolean).slice(0, 3);
  return clean.length ? `${prompt.trim()}, ${clean.join(", ")}` : prompt.trim();
}
