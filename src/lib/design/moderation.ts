import { prisma } from "@/lib/prisma";
import { checkBlocklist, blockMessage } from "./blocklist";
import {
  classifyPrompt,
  classifyImage,
  classifierAvailable,
  type ClassifierTransport,
} from "./classifier";
import type { DesignIdentity } from "./identity";

export { classifierAvailable };

export type ModerationResult =
  | { allowed: true }
  | { allowed: false; message: string; stage: "blocklist" | "classifier" };

const RETRY_MESSAGE =
  "We couldn't check your prompt just now — please try again in a moment.";

async function logBlock(
  identity: DesignIdentity,
  prompt: string,
  stage: "blocklist" | "classifier",
  verdict: "allow" | "block",
  reason: string | null,
) {
  await prisma.designModerationLog.create({
    data: {
      userId: identity.userId,
      anonId: identity.anonId,
      prompt,
      stage,
      verdict,
      reason,
    },
  });
}

export async function moderatePrompt(
  identity: DesignIdentity,
  prompt: string,
  transport?: ClassifierTransport,
): Promise<ModerationResult> {
  const hit = checkBlocklist(prompt);
  if (hit) {
    await logBlock(identity, prompt, "blocklist", "block", `${hit.category}:${hit.term}`);
    return { allowed: false, message: blockMessage(hit.category), stage: "blocklist" };
  }
  const result = await (transport
    ? classifyPrompt(prompt, transport)
    : classifyPrompt(prompt));
  if (result.verdict === "allow") {
    await logBlock(identity, prompt, "classifier", "allow", null);
    return { allowed: true };
  }
  // block AND unavailable both block — fail closed.
  const reason = result.verdict === "block" ? result.reason : "classifier unavailable";
  await logBlock(identity, prompt, "classifier", "block", reason);
  return {
    allowed: false,
    message:
      result.verdict === "block"
        ? `We can't generate that: ${result.reason}. Try an original design!`
        : RETRY_MESSAGE,
    stage: "classifier",
  };
}

export async function moderateImage(
  identity: DesignIdentity,
  dataUri: string,
  transport?: ClassifierTransport,
): Promise<ModerationResult> {
  const result = await (transport
    ? classifyImage(dataUri, transport)
    : classifyImage(dataUri));
  if (result.verdict === "allow") {
    await logBlock(identity, "[image upload]", "classifier", "allow", null);
    return { allowed: true };
  }
  const reason = result.verdict === "block" ? result.reason : "classifier unavailable";
  await logBlock(identity, "[image upload]", "classifier", "block", reason);
  return {
    allowed: false,
    message:
      result.verdict === "block"
        ? `We can't use that image: ${reason}. Try a photo of an original object!`
        : RETRY_MESSAGE,
    stage: "classifier",
  };
}
