// A child's avatar: the colour of their disc, and the ink their initial sits in.
//
// Both live here, together, because they are one decision. A palette colour is
// only allowed if a child's initial is READABLE on it — see the AA check in
// tests/battery/a11y/avatar-contrast.spec.ts, which asserts exactly that for
// every colour below. Adding a pretty colour that fails is caught there.
//
// Why it's a shared module rather than sitting in the action that uses it:
// `actions/auth.ts` is "use server", so it can only export async functions. The
// palette was therefore copy-pasted into `prisma/seed.ts`, and the copy drifted
// — the seed grew a set of Tailwind defaults with no relation to the brand, and
// some of them are unreadable at any ink. One source of truth, like
// `classCodeChars.ts` for the class-code alphabet.

// The eight discs, assigned round-robin at signup. Warm and distinguishable:
// the colour is what tells two Olivias apart on the name wall, so it carries
// real weight (see SJ-05 — a surname initial is banned by rule 2, which leaves
// the colour and the picture as the only compliant disambiguators).
export const AVATAR_PALETTE = [
  "#E08A9B", // pink
  "#8AB9D6", // blue
  "#A6C979", // green
  "#C2476B", // jam
  "#F0B441", // honey
  "#37796F", // glass
  "#B99CD6", // violet
  "#E8A06A", // apricot
] as const;

export const AVATAR_INK_DARK = "#22304A"; // --ink
export const AVATAR_INK_LIGHT = "#FFFDF7"; // --cream

// Relative luminance, per WCAG 2.x. Nine lines of arithmetic rather than a
// dependency — this is a product holding children's work, and the supply chain
// is part of the attack surface (rule 15: keep dependencies patched).
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const rgb = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lin = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// The readable ink for a disc: whichever brand ink contrasts better against it.
//
// The ink adapts so the PALETTE doesn't have to be dulled — the warm colours
// are the brand, and they're load-bearing on the name wall. Cream-on-everything
// left six of the eight colours at 1.8–2.5:1 against a 4.5:1 floor, so six
// children in eight were asked to find themselves by an initial they could
// barely see. Nothing caught it: the a11y gate baselines `color-contrast` away
// while the F11 debt is open, so the name-picker scan passed throughout.
//
// This picks the BETTER ink, which is not the same as promising a readable one:
// a colour that fails at both inks is a bad colour, and the test is what stops
// one entering the palette.
export function avatarInk(background: string): string {
  return contrastRatio(AVATAR_INK_DARK, background) >= contrastRatio(AVATAR_INK_LIGHT, background)
    ? AVATAR_INK_DARK
    : AVATAR_INK_LIGHT;
}
