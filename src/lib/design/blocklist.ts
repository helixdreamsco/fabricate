/**
 * Stage-1 moderation: blocklist of franchise/character/brand/unsafe terms.
 * THIS IS THE ONE EDITABLE FILE — add or remove terms here.
 * Matching is case-insensitive on word boundaries; multi-word terms match as
 * phrases. Stage 2 (LLM classifier) catches paraphrases this list misses.
 */
export const BLOCKLIST: { term: string; category: string }[] = [
  // Nintendo / Pokémon
  { term: "nintendo", category: "trademark" },
  { term: "pokemon", category: "trademark" },
  { term: "pokémon", category: "trademark" },
  { term: "pikachu", category: "trademark" },
  { term: "charizard", category: "trademark" },
  { term: "eevee", category: "trademark" },
  { term: "mario", category: "trademark" },
  { term: "luigi", category: "trademark" },
  { term: "zelda", category: "trademark" },
  { term: "link from zelda", category: "trademark" },
  { term: "kirby", category: "trademark" },
  { term: "donkey kong", category: "trademark" },
  { term: "yoshi", category: "trademark" },
  // Games Workshop
  { term: "warhammer", category: "trademark" },
  { term: "games workshop", category: "trademark" },
  { term: "space marine", category: "trademark" },
  { term: "40k", category: "trademark" },
  { term: "adeptus", category: "trademark" },
  { term: "tyranid", category: "trademark" },
  { term: "necron", category: "trademark" },
  // Disney / Marvel / Star Wars / Pixar
  { term: "disney", category: "trademark" },
  { term: "mickey mouse", category: "trademark" },
  { term: "minnie mouse", category: "trademark" },
  { term: "elsa", category: "trademark" },
  { term: "frozen princess", category: "trademark" },
  { term: "marvel", category: "trademark" },
  { term: "spider-man", category: "trademark" },
  { term: "spiderman", category: "trademark" },
  { term: "iron man", category: "trademark" },
  { term: "hulk", category: "trademark" },
  { term: "thanos", category: "trademark" },
  { term: "avengers", category: "trademark" },
  { term: "baby yoda", category: "trademark" },
  { term: "grogu", category: "trademark" },
  { term: "darth vader", category: "trademark" },
  { term: "star wars", category: "trademark" },
  { term: "stormtrooper", category: "trademark" },
  { term: "lightsaber", category: "trademark" },
  { term: "buzz lightyear", category: "trademark" },
  // Anime / other franchises
  { term: "goku", category: "trademark" },
  { term: "dragon ball", category: "trademark" },
  { term: "naruto", category: "trademark" },
  { term: "one piece luffy", category: "trademark" },
  { term: "luffy", category: "trademark" },
  { term: "totoro", category: "trademark" },
  { term: "ghibli", category: "trademark" },
  { term: "sailor moon", category: "trademark" },
  { term: "hello kitty", category: "trademark" },
  { term: "sanrio", category: "trademark" },
  { term: "minion", category: "trademark" },
  { term: "sonic the hedgehog", category: "trademark" },
  { term: "lego", category: "trademark" },
  { term: "harry potter", category: "trademark" },
  { term: "hogwarts", category: "trademark" },
  { term: "batman", category: "trademark" },
  { term: "superman", category: "trademark" },
  { term: "godzilla", category: "trademark" },
  // Weapons
  { term: "gun", category: "weapon" },
  { term: "pistol", category: "weapon" },
  { term: "rifle", category: "weapon" },
  { term: "firearm", category: "weapon" },
  { term: "glock", category: "weapon" },
  { term: "ammunition", category: "weapon" },
  { term: "suppressor", category: "weapon" },
  { term: "silencer", category: "weapon" },
  { term: "knife", category: "weapon" },
  { term: "knuckle duster", category: "weapon" },
  { term: "brass knuckles", category: "weapon" },
  { term: "grenade", category: "weapon" },
  { term: "explosive", category: "weapon" },
  // Sexual content
  { term: "nsfw", category: "sexual" },
  { term: "nude", category: "sexual" },
  { term: "naked", category: "sexual" },
  { term: "sex toy", category: "sexual" },
  { term: "dildo", category: "sexual" },
  { term: "erotic", category: "sexual" },
  { term: "hentai", category: "sexual" },
  // Real people
  { term: "taylor swift", category: "real_person" },
  { term: "elon musk", category: "real_person" },
  { term: "donald trump", category: "real_person" },
  { term: "keir starmer", category: "real_person" },
  { term: "celebrity", category: "real_person" },
];

export interface BlocklistHit {
  term: string;
  category: string;
}

const LEET: Record<string, string> = {
  "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b",
  "@": "a", "$": "s", "!": "i", "€": "e", "£": "l",
};

/**
 * Normalise text so common evasions still match the blocklist: lowercase,
 * strip diacritics (pokémon→pokemon), map leetspeak digits/symbols
 * (p1kachu→pikachu), and collapse repeated letters (pikaaachu→pikachu).
 */
export function normalise(text: string): string {
  let s = text.toLowerCase().normalize("NFKD");
  s = s.replace(/[̀-ͯ]/g, ""); // combining diacritics
  s = s.replace(/[0134578@$!€£]/g, (ch) => LEET[ch] ?? ch);
  s = s.replace(/([a-z])\1{2,}/g, "$1"); // 3+ repeated letters → 1
  return s;
}

function matches(haystack: string, term: string): boolean {
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}($|[^a-z0-9])`, "i").test(haystack);
}

export function checkBlocklist(prompt: string): BlocklistHit | null {
  const norm = normalise(prompt);
  // Also match with spacing/punctuation stripped ("p o k e m o n").
  const squashed = norm.replace(/[^a-z0-9]/g, "");
  for (const { term, category } of BLOCKLIST) {
    const normTerm = normalise(term);
    if (matches(norm, normTerm)) return { term, category };
    if (normTerm.replace(/[^a-z0-9]/g, "").length >= 5 &&
        squashed.includes(normTerm.replace(/[^a-z0-9]/g, ""))) {
      return { term, category };
    }
  }
  return null;
}

export function blockMessage(category: string): string {
  switch (category) {
    case "trademark":
      return "We can't generate trademarked or franchise characters — try an original design instead!";
    case "weapon":
      return "We can't print weapons or weapon parts. Try a different design.";
    case "sexual":
      return "We can't generate adult content. Try a different design.";
    case "real_person":
      return "We can't generate likenesses of real people. Try an original character instead!";
    default:
      return "We can't generate that — try an original design.";
  }
}
