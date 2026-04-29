import { customAlphabet } from "nanoid";
import { prisma } from "@/lib/prisma";

const HEX_CHARS = "0123456789ABCDEF";
const generateHex6 = customAlphabet(HEX_CHARS, 6);

export function buildTestStripCode(): string {
  return `HD-${generateHex6()}`;
}

/**
 * Generate a `HD-XXXXXX` code that doesn't collide with any existing Job.
 * 16M-character space; collisions are extremely rare but cheap to retry.
 */
export async function generateUniqueTestStripCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = buildTestStripCode();
    const taken = await prisma.job.findUnique({
      where: { testStripCode: code },
      select: { id: true },
    });
    if (!taken) return code;
  }
  throw new Error("Failed to generate a unique test strip code after 8 attempts.");
}
