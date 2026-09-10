---
name: validate-what-is-stored
description: A safeguarding text check must run on the exact string that gets stored (and its decoded forms), because parsers like URL rewrite input; checking the typed text or one parsed field let /uploads/ through
metadata:
  type: feedback
---

Run a refusal check on the value that is actually persisted, not on what the
user typed and not on one component of it. The first web-link validator
checked `/uploads/` on the typed text and on `url.pathname`; the WHATWG URL
parser silently deletes tab, newline and CR anywhere in the input, and the
query and fragment were never re-checked, so `?q=/up<tab>loads/x.png` was
stored as `?q=/uploads/x.png`. The safeguarding reviewer found it, not the
tests I had written. Also check the percent-decoded form (repeat until
stable), and treat an undecodable escape as a refusal for an address. A free
text field stored in the same payload (a link's label) needs the same check.

**Why:** in StoryJar the media route authorises by text-matching `/uploads/`
inside payload JSON (FINDINGS F75), so any stored string is a potential key,
whatever field it sits in.

**How to apply:** when writing a validator for anything that ends up in
`objectsJson`, `quizJson` or a snapshot, add refused-table rows for control
characters, encoded forms and every field of the parsed value, and run the
table against the reverted fix ([[verify-a-gate-by-breaking-it]]).
