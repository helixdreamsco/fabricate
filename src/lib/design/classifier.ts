import Anthropic from "@anthropic-ai/sdk";

/**
 * Stage-2 moderation: LLM classifier for paraphrases the blocklist misses
 * ("small electric yellow mouse creature"). Answers ALLOW or BLOCK: <reason>.
 * FAIL CLOSED: any classifier error, unparseable output, or missing API key
 * blocks the prompt — generating unmoderated content risks IP/abuse issues,
 * a retry costs the user nothing.
 */
const SYSTEM = `You are a content moderator for a 3D-printing marketplace's text-to-3D generator.
Users type prompts describing objects to 3D print. Decide if a prompt is allowed.

BLOCK if the prompt describes or clearly evokes any of:
- Copyrighted or trademarked characters, franchises or brands, even without naming them
  (e.g. "small electric yellow mouse creature with red cheeks" = Pikachu -> BLOCK,
  "plumber in red overalls with a moustache and cap" = Mario -> BLOCK,
  "armoured super-soldier with huge shoulder pads and a chainsword" = Space Marine -> BLOCK).
- Weapons or weapon parts (functional or realistic replicas).
- Sexual or adult content.
- Likenesses of real, identifiable people.

ALLOW original designs, generic animals/objects/fantasy creatures, and things that are
merely inspired-by without copying a protected character.

Respond with EXACTLY one line: "ALLOW" or "BLOCK: <short reason>".`;

const IMAGE_SYSTEM = `You are a content moderator for a 3D-printing marketplace's image-to-3D generator.
Users upload a reference photo of an object to turn into a 3D print. Decide if the image is allowed.

BLOCK images that primarily show:
- Real, identifiable people (faces, portraits, photos of people).
- Copyrighted or trademarked characters, toys of them, or branded products
  (e.g. a Pikachu plush, a Warhammer miniature, a Disney figurine).
- Weapons or realistic weapon replicas.
- Sexual or adult content.

ALLOW ordinary objects, original sculptures/toys, plants, tools, furniture, food, etc.

Respond with EXACTLY one line: "ALLOW" or "BLOCK: <short reason>".`;

const LOGO_SYSTEM = `You are a content moderator for a 3D-printing service that prints branded merchandise.
Businesses upload their own logo as an SVG to put on keyrings, coasters and signage.
You are shown the SVG source. Decide if it is allowed.

BLOCK only when the artwork clearly is:
- A hate symbol, extremist insignia, or a symbol whose primary modern use is hateful.
- Sexual or adult content.
- The registered mark of a MAJOR global brand — the sort of mark almost anyone
  would recognise (e.g. the Nike swoosh, the Apple silhouette, the Adidas
  trefoil, McDonald's golden arches, a Disney or Pokemon character, a car
  marque's badge, a football club crest). These are trademark risks because
  the uploader is overwhelmingly unlikely to be that brand.
- A weapon or realistic weapon replica.

ALLOW everything else, and lean strongly toward allowing. Nearly every upload
is a small business printing its own logo: abstract marks, monograms,
initials, geometric shapes, simple icons, wordmarks of companies you have
never heard of, local clubs, bands, cafes, charities. An unfamiliar name is
evidence the uploader owns it, NOT evidence of infringement. Do not block for
looking "generic", "professional", or vaguely similar to some other logo.

Respond with EXACTLY one line: "ALLOW" or "BLOCK: <short reason>".`;

export type ClassifierVerdict =
  | { verdict: "allow" }
  | { verdict: "block"; reason: string }
  /** Classifier could not run or answer sensibly — callers must treat this as a block. */
  | { verdict: "unavailable" };

/** Parse the model's one-line protocol. Exported for tests. */
export function parseVerdict(text: string): ClassifierVerdict {
  const line = text.trim();
  if (/^ALLOW\b/i.test(line)) return { verdict: "allow" };
  const match = line.match(/^BLOCK:?\s*(.*)$/im);
  if (match) return { verdict: "block", reason: match[1] || "not allowed" };
  return { verdict: "unavailable" };
}

/** Transport = one Anthropic call returning the raw text. Injectable in tests. */
export type ClassifierTransport = (
  system: string,
  content: Anthropic.MessageParam["content"],
) => Promise<string>;

const anthropicTransport: ClassifierTransport = async (system, content) => {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: { effort: "low" },
    system,
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") return "BLOCK: declined by safety systems";
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
};

export function classifierAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

async function classify(
  system: string,
  content: Anthropic.MessageParam["content"],
  transport: ClassifierTransport,
): Promise<ClassifierVerdict> {
  if (transport === anthropicTransport && !classifierAvailable()) {
    console.warn("moderation: ANTHROPIC_API_KEY unset — failing closed");
    return { verdict: "unavailable" };
  }
  try {
    return parseVerdict(await transport(system, content));
  } catch (e) {
    console.error("moderation classifier error", e);
    return { verdict: "unavailable" };
  }
}

export async function classifyPrompt(
  prompt: string,
  transport: ClassifierTransport = anthropicTransport,
): Promise<ClassifierVerdict> {
  return classify(SYSTEM, `Prompt: ${JSON.stringify(prompt)}`, transport);
}

/**
 * Moderation for uploaded brand logos. The classifier reads the sanitised
 * SVG source rather than a render: the markup is already safe to hand over,
 * and it carries the wordmark text that makes a major-brand mark
 * recognisable.
 */
export async function classifyLogo(
  sanitisedSvg: string,
  transport: ClassifierTransport = anthropicTransport,
): Promise<ClassifierVerdict> {
  // Cap what we send: a huge path soup adds no signal and costs tokens.
  const excerpt = sanitisedSvg.slice(0, 20_000);
  return classify(
    LOGO_SYSTEM,
    `Uploaded logo SVG:\n${excerpt}`,
    transport,
  );
}

/** Vision moderation for image-to-3D uploads. `dataUri` = data:image/...;base64,... */
export async function classifyImage(
  dataUri: string,
  transport: ClassifierTransport = anthropicTransport,
): Promise<ClassifierVerdict> {
  const match = dataUri.match(/^data:(image\/(?:png|jpeg));base64,([\s\S]+)$/);
  if (!match) return { verdict: "block", reason: "unsupported image format" };
  return classify(
    IMAGE_SYSTEM,
    [
      {
        type: "image",
        source: { type: "base64", media_type: match[1] as "image/png" | "image/jpeg", data: match[2] },
      },
      { type: "text", text: "Moderate this reference image." },
    ],
    transport,
  );
}
