// Turning a pasted class register into first-name-only display names.
//
// Storyjar stores a child's FIRST NAME only — never a surname (SAFEGUARDING.md
// rule 2, data minimisation). Teachers, though, usually have a register with
// full names, so we let them paste "Olivia Smith" and keep just "Olivia".
//
// When two children in the same class share a first name we can't just drop the
// surname, so we add the SHORTEST surname prefix that tells them apart — one
// letter if that's enough, more only when it isn't:
//   Olivia Smith + Olivia Small  ->  "Olivia Smi" + "Olivia Sma"
// This keeps only the minimal letters needed (the protective default), rather
// than a whole surname.

type Parsed = { first: string; surname: string };

function parseEntry(raw: string): Parsed | null {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  const sp = cleaned.indexOf(" ");
  if (sp === -1) return { first: cleaned, surname: "" };
  return { first: cleaned.slice(0, sp), surname: cleaned.slice(sp + 1) };
}

// "smith" (len 3) -> "Smi"; capitalise the first letter, lower-case the rest.
function withPrefix(first: string, surname: string, len: number): string {
  const p = surname.slice(0, len);
  const prefix = p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
  return `${first} ${prefix}`;
}

/**
 * Derive the names to store for a pasted list of children.
 *
 * - Surnames are removed; only the first name is kept.
 * - Exact duplicates within the paste (same full name) are collapsed to one.
 * - Where a first name repeats (within the paste, or against an existing child
 *   in the class), the shortest disambiguating surname prefix is appended.
 *
 * @param rawEntries the pasted names, already split into one entry per name
 * @param existingNames names already in the class (to avoid clashing with them)
 */
export function deriveChildNames(rawEntries: string[], existingNames: string[] = []): string[] {
  const entries: Parsed[] = [];
  const seenFull = new Set<string>();
  for (const raw of rawEntries) {
    const parsed = parseEntry(raw);
    if (!parsed) continue;
    const full = `${parsed.first} ${parsed.surname}`.trim().toLowerCase();
    if (seenFull.has(full)) continue; // same child pasted twice
    seenFull.add(full);
    entries.push(parsed);
  }

  // Group entries by first name (case-insensitive).
  const groups = new Map<string, number[]>();
  entries.forEach((e, i) => {
    const key = e.first.toLowerCase();
    const bucket = groups.get(key);
    if (bucket) bucket.push(i);
    else groups.set(key, [i]);
  });

  const existingLower = new Set(existingNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const assigned = new Set<string>(existingLower); // names already taken in the class
  const result: string[] = new Array(entries.length);

  for (const idxs of groups.values()) {
    const first = entries[idxs[0]].first;
    const clashesWithExisting = existingLower.has(first.toLowerCase());

    // A lone first name that doesn't already exist in the class stays as-is.
    if (idxs.length === 1 && !clashesWithExisting) {
      result[idxs[0]] = first;
      assigned.add(first.toLowerCase());
      continue;
    }

    // Shortest common surname-prefix length that makes the group distinct.
    const surnames = idxs.map((i) => entries[i].surname);
    const maxLen = surnames.reduce((m, s) => Math.max(m, s.length), 0);
    let common = 1;
    for (; common <= maxLen; common++) {
      const prefixes = surnames.map((s) => s.slice(0, common).toLowerCase());
      if (new Set(prefixes).size === prefixes.length) break;
    }

    for (const i of idxs) {
      const surname = entries[i].surname;
      let name: string;
      if (!surname) {
        // No surname to shorten — keep the bare first name (may duplicate).
        name = first;
      } else {
        // Start at the group length, then lengthen only if it still clashes
        // with a name already taken (e.g. an existing child in the class).
        let len = Math.min(common, surname.length);
        name = withPrefix(first, surname, len);
        while (assigned.has(name.toLowerCase()) && len < surname.length) {
          len += 1;
          name = withPrefix(first, surname, len);
        }
      }
      result[i] = name;
      assigned.add(name.toLowerCase());
    }
  }

  return result;
}
