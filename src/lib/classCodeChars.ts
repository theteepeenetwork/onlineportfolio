// The alphabet a class code is built from, and how long a code is.
//
// Split out of `classCode.ts` (which is `server-only`, because it generates
// codes and hits the database) so the child's on-screen keypad can import it
// too. One source of truth matters here: every code a child ever types comes
// from `makeClassCode`, so the keypad and the generator must agree.
//
// Unambiguous characters only — no 0/O, no 1/I/L — so a young child reading a
// code off the board can't confuse two glyphs.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const CODE_LENGTH = 6;

// What the keypad SHOWS, versus what a code may contain.
//
// The keypad shows the whole alphabet and 0–9, and disables the five characters
// a code can never contain (I, L, O, 0, 1). It would be simpler to just leave
// those keys out — but a child of five knows the alphabet song, and a keypad
// that jumps H → J → K reads as broken to them. They hunt for the missing key
// rather than concluding it isn't needed. So the shape stays familiar and the
// impossible keys simply don't respond, which is a fact a child can see rather
// than a dead end they discover by failing.
export const KEYPAD_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export const KEYPAD_DIGITS = "0123456789";

// Can this character appear in a real class code? Drives the disabled keys, and
// filters physical-keyboard input, from the one alphabet above.
export function isCodeChar(ch: string): boolean {
  return CODE_ALPHABET.includes(ch.toUpperCase());
}

// A child may type a code with spaces ("SUN 123"), and a teacher may paste one
// with a stray space or a lowercase letter. None of that is a wrong code — so
// normalise before looking it up rather than failing them for it.
export function normaliseClassCode(raw: string | undefined | null): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}
