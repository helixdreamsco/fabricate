/**
 * Reddit monitor configuration — subreddits we poll and the keyword
 * filter applied to incoming posts + comments.
 *
 * Edit these lists directly. Tuning advice:
 *   - Subreddits: prefer specific over broad. r/3Dprinting is high
 *     volume — most matches there are noise. r/AskUK is broader but
 *     catches "where can I get this printed" style asks.
 *   - Keywords: start narrow, widen if recall is low. The matcher is
 *     case-insensitive substring, so "3d print" catches "3D print",
 *     "3D printer", "3D-printing", etc.
 *   - Exclude phrases let us suppress obvious non-asks ("I bought a
 *     3D printer", "for sale: 3D printer").
 */

export const MONITORED_SUBREDDITS: ReadonlyArray<string> = [
  // 3D printing communities (high signal but high volume)
  "3Dprinting",
  "FunctionalPrint",
  "FixMyPrint",
  "BambuLab",
  "ender3",
  "PrusaPrinters",
  "AnycubicOfficial",
  // UK / London — where "where can I get this printed in London" asks live
  "london",
  "AskLondon",
  "AskUK",
  "CasualUK",
  // Generalist "make me a thing" subs
  "SomebodyMakeThis",
  "HelpMeFind",
  "Hobbies",
  // Adjacent maker communities
  "cosplay",
  "boardgames",
];

/** Substrings (case-insensitive). A post/comment is a match if it
 *  contains AT LEAST ONE keyword. Filtered against exclude list after.
 *  Mix high-precision phrases ("where can I get this printed") with
 *  high-recall ones ("3d print service") — exclude list catches the
 *  obvious false positives. */
export const INCLUDE_KEYWORDS: ReadonlyArray<string> = [
  // Direct service asks
  "where can i get this printed",
  "where can i get this 3d printed",
  "looking for someone to print",
  "anyone willing to print",
  "anyone able to print",
  "anyone want to print",
  "could someone print",
  "could anyone print",
  "print this for me",
  "need this printed",
  "need this 3d printed",
  "get this 3d printed",
  "have this printed",
  "have this 3d printed",
  // Service shopping
  "3d print service",
  "3d printing service",
  "3d printing services",
  "commission a print",
  "commission a 3d print",
  "uk 3d printing",
  "london 3d printing",
  "3d printing london",
  "3d printing uk",
  "3d printer near me",
  "print on demand 3d",
  // Brand mentions (catch existing chatter)
  "fabricate.helixdreams",
  "helixdreams",
  "fabricate 3d",
];

/** If any of these substrings appear, the match is suppressed. Cheap
 *  guard against the obvious "I sell a printer" / "look at my new
 *  printer" style posts that share keywords. */
export const EXCLUDE_KEYWORDS: ReadonlyArray<string> = [
  "for sale",
  "selling my",
  "i bought",
  "just got my",
  "just bought",
  "new printer",
  "my new 3d printer",
  "[wts]",
  "[wtb]", // we're not selling/buying via reddit
];

/** Capped at 1024 chars in the digest email — anything longer risks
 *  blowing up multipart limits when there are many matches. */
export const BODY_EXCERPT_MAX_CHARS = 600;

/** Hard ceiling per sweep so a single subreddit going viral doesn't
 *  produce a 200-row email. */
export const MAX_MATCHES_PER_DIGEST = 30;
