// Matching an activity against what a teacher typed.
//
// Deliberately a plain module with no "server-only" import, no database and no
// React, so a blocking test can import it and check the matching rules directly
// rather than inferring them from a rendered grid. The screens do the filtering
// in memory over data they have already been authorised to hold, which is why
// this can be pure: search narrows what is on the page, and can never widen it.
//
// WHAT IT MATCHES, AND WHY THAT LIST
//
// Title, instructions and tags. A teacher looking for "the leaf one" will type
// a word from the title; a teacher looking for "that thing about sounds" will
// type a word that only appears in the instructions; a teacher who has bothered
// to tag their library will type the tag. Anything else we could match on
// (dates, class names, run history) answers a different question and would make
// results feel arbitrary.

export type SearchableActivity = {
  title: string;
  instructions?: string | null;
  tags?: string[];
};

// Case and punctuation are noise here. A teacher typing "phonics!" or "PHONICS"
// means the same thing as "phonics", and a teacher typing "st bede's" should not
// be defeated by which apostrophe their keyboard produced.
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[‘’‛ʼ]/g, "'")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Every word has to appear somewhere, but not all in the same field and not in
// the order typed. "autumn leaves" finds an activity called "Our autumn walk"
// tagged "Leaves", which is what a person means by those two words. Requiring
// one field to hold the whole phrase would fail that, and matching ANY word
// would return most of the library for a two-word search.
export function matchesActivitySearch(activity: SearchableActivity, query: string): boolean {
  const words = normalise(query).split(" ").filter(Boolean);
  if (words.length === 0) return true; // an empty search hides nothing

  const haystack = normalise(
    [activity.title, activity.instructions ?? "", ...(activity.tags ?? [])].join(" "),
  );
  return words.every((word) => haystack.includes(word));
}

// The count sentence, in one place so both screens say it the same way and a
// screen reader hears the same thing on each.
export function searchResultLabel(shown: number, total: number, query: string): string {
  if (!normalise(query)) return `${total} ${total === 1 ? "activity" : "activities"}`;
  if (shown === 0) return "Nothing matches that";
  return `${shown} of ${total} ${total === 1 ? "activity" : "activities"}`;
}
