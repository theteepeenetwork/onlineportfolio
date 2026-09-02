import { test, expect } from "@playwright/test";
import { magicLinkEmail, staffInviteEmail } from "@/lib/emailTemplates";

// ===========================================================================
// Email templates carry no tracking pixel, and no external reference of any
// kind
//
// WHAT BREAKS IF THIS FAILS. An `<img>` in an email is how open tracking
// works: the client fetches it, and whoever serves it learns that this
// recipient opened this message, at this time, from this IP address. StoryJar
// tells schools the opposite. `docs/DPIA.md` (R14) and the public
// `/legal/sub-processors` page both state that we cannot tell whether a
// particular parent opened an email. A single hosted logo, web font or CDN
// asset in either of these templates makes both of those statements false, on
// a page a school's data protection lead reads before signing, and the people
// being tracked are the parents of primary-age children. That is a rule 11
// breach (SAFEGUARDING.md: no analytics, advertising or behavioural-profiling
// third parties, ever) delivered straight to an inbox.
//
// It also fails quietly. Nobody sees a 1x1 pixel. Until this spec existed the
// only check was a human sending a probe and reading the raw source by hand,
// which had happened exactly once.
//
// WHAT THIS CANNOT SEE. Only what StoryJar generates. A provider can still
// inject a pixel into a clean message on its way out, which is precisely what
// Brevo did and why it is no longer the provider. That half is checked by
// sending a real message and reading the delivered source:
// `railway run npx tsx scripts/verify-mail.ts <a mailbox you control>`.
// The two halves together are the claim; neither is sufficient alone.
//
// These templates are pure functions of a URL, which is why this spec can
// import them at all. See the header of `src/lib/emailTemplates.ts` for why
// that module has no `server-only` guard, and what would put it back.
//
// This is a BLOCKING test.
// ===========================================================================

const LINK = "https://storyjar.co.uk/family/enter?token=testtoken123";
const SCHOOL = "St Bede's Primary";
// The admin who arranged an unpaid school. A second piece of caller-supplied
// text reaching an email body, which is why it is in this file at all.
const ARRANGER = "Mrs Okonkwo";

// Every absolute URL in a string, however it is written.
function urlsIn(html: string): string[] {
  return html.match(/https?:\/\/[^\s"'<>)]+/gi) ?? [];
}

const templates = [
  { name: "magicLinkEmail", mail: magicLinkEmail(LINK) },
  { name: "staffInviteEmail", mail: staffInviteEmail(SCHOOL, LINK, null) },
  // THE UNPAID VARIANT IS A THIRD TEMPLATE, not a variation the loop can skip.
  // It is a different body — an extra paragraph carrying a second untrusted
  // string — and every property this file asserts has to hold for it too: no
  // image, no remote reference, one URL, inline styles, and a plain-text part
  // that works on its own. A disclosure that only renders in HTML is no
  // disclosure to the reader whose gateway strips it.
  {
    name: "staffInviteEmail (unpaid school)",
    mail: staffInviteEmail(SCHOOL, LINK, { arrangedBy: ARRANGER }),
  },
];

for (const { name, mail } of templates) {
  test(`${name} contains no image, so no open pixel can hide in it`, () => {
    expect(mail.html, "an <img> in an email is an open-tracking pixel").not.toMatch(/<img\b/i);
    // The attribute matters as much as the tag: `src` on any element, a
    // `background=` attribute, or a CSS `url()` all fetch a remote asset and
    // tell the server who opened the message.
    expect(mail.html, "no element may fetch a remote asset").not.toMatch(/\ssrc\s*=/i);
    expect(mail.html, "no element may fetch a remote asset").not.toMatch(/\sbackground\s*=/i);
    expect(mail.html, "no CSS may fetch a remote asset").not.toMatch(/url\s*\(/i);
  });

  test(`${name} references no URL other than the one it was given`, () => {
    // Both templates are deliberately free of external references, so any other
    // http occurrence means someone has added a CDN font, a hosted logo or an
    // analytics call. This is the assertion that catches a well-meaning change.
    const found = new Set(urlsIn(mail.html));
    expect([...found], "the only URL in the HTML must be the sign-in link").toEqual([LINK]);
    expect([...new Set(urlsIn(mail.text))], "same for the plain-text part").toEqual([LINK]);
    // A protocol-relative reference (//fonts.example/x.css) would slip past the
    // check above while still fetching from a third party.
    expect(mail.html, "no protocol-relative external reference").not.toMatch(/["'(]\/\/[^/]/);
  });

  test(`${name} uses inline styles only, with no stylesheet to swap later`, () => {
    // An external stylesheet is a second, quieter way to make a mail client
    // fetch something, and a <style> block is where a background-image ends up
    // when someone tries to add a logo without adding an <img>.
    expect(mail.html, "no <style> block").not.toMatch(/<style\b/i);
    expect(mail.html, "no <link> element").not.toMatch(/<link\b/i);
  });

  test(`${name} works with the HTML stripped away`, () => {
    // Plain text is the source of truth. A parent whose client shows text only,
    // or whose gateway strips HTML, must still be able to reach their child's
    // work.
    expect(mail.text, "the plain-text part must carry the link").toContain(LINK);
    expect(mail.text.length).toBeGreaterThan(100);
  });
}

test("the subjects are fixed copy, not built from anything", () => {
  // A subject line is the one part of an email that is visible in a preview on
  // a lock screen. Nothing may reach it.
  expect(magicLinkEmail(LINK).subject).toBe("Your StoryJar sign-in link");
  expect(staffInviteEmail(SCHOOL, LINK, null).subject).toBe("You've been invited to StoryJar");
  expect(staffInviteEmail("Oakfield Junior", LINK, null).subject).toBe(
    "You've been invited to StoryJar",
  );
  // Including the unpaid one. The disclosure belongs in the body: a subject line
  // reading "unpaid" is visible on a lock screen to anybody holding the phone,
  // and it would tell them something about a school rather than about them.
  expect(staffInviteEmail(SCHOOL, LINK, { arrangedBy: ARRANGER }).subject).toBe(
    "You've been invited to StoryJar",
  );
});

test("magicLinkEmail interpolates the URL and nothing else", () => {
  // Render twice with different URLs and put a placeholder back where each one
  // stood. If anything else varied between the two, these no longer match, and
  // that "anything else" would be a value nobody has audited reaching a parent.
  const a = magicLinkEmail("https://a.example/enter?token=aaa");
  const b = magicLinkEmail("https://b.example/enter?token=bbb");
  const blank = (s: string, url: string) => s.split(url).join("{{URL}}");

  expect(blank(a.html, "https://a.example/enter?token=aaa")).toBe(
    blank(b.html, "https://b.example/enter?token=bbb"),
  );
  expect(blank(a.text, "https://a.example/enter?token=aaa")).toBe(
    blank(b.text, "https://b.example/enter?token=bbb"),
  );
  // Which is the point: no child's name, no class and no school reaches this
  // template (SAFEGUARDING rules 2 and 4). A school holds the parent's address,
  // not us, and a mistyped address must tell a stranger nothing about a child.
  expect(a.html).toContain("https://a.example/enter?token=aaa");
});

test("staffInviteEmail interpolates the school name and the URL, and nothing else", () => {
  const a = staffInviteEmail("Alpha School", "https://a.example/set?token=aaa", null);
  const b = staffInviteEmail("Beta Academy", "https://b.example/set?token=bbb", null);
  const blank = (s: string, school: string, url: string) =>
    s.split(url).join("{{URL}}").split(school).join("{{SCHOOL}}");

  expect(blank(a.html, "Alpha School", "https://a.example/set?token=aaa")).toBe(
    blank(b.html, "Beta Academy", "https://b.example/set?token=bbb"),
  );
  expect(blank(a.text, "Alpha School", "https://a.example/set?token=aaa")).toBe(
    blank(b.text, "Beta Academy", "https://b.example/set?token=bbb"),
  );
});

test("the unpaid invitation interpolates the arranger's name and nothing else new", () => {
  // Same technique as the test above, one variable further. Blank out the three
  // interpolated values and the two renders must be identical — so nothing about
  // the school, the invitee or anybody's account has crept into the disclosure
  // paragraph along with the name it is allowed to carry.
  const a = staffInviteEmail("Alpha School", "https://a.example/set?token=aaa", {
    arrangedBy: "Mr Alpha",
  });
  const b = staffInviteEmail("Beta Academy", "https://b.example/set?token=bbb", {
    arrangedBy: "Ms Beta",
  });
  const blank = (s: string, school: string, url: string, who: string) =>
    s.split(url).join("{{URL}}").split(school).join("{{SCHOOL}}").split(who).join("{{WHO}}");

  expect(
    blank(a.html, "Alpha School", "https://a.example/set?token=aaa", "Mr Alpha"),
  ).toBe(blank(b.html, "Beta Academy", "https://b.example/set?token=bbb", "Ms Beta"));
  expect(
    blank(a.text, "Alpha School", "https://a.example/set?token=aaa", "Mr Alpha"),
  ).toBe(blank(b.text, "Beta Academy", "https://b.example/set?token=bbb", "Ms Beta"));
});

test("the unpaid invitation says it is unpaid, in both parts", () => {
  // THE DISCLOSURE IS THE CONTROL, not decoration on one. It is the only thing
  // in the self-serve purchase feature that reaches a person who has not signed
  // up yet: a real head teacher whose school has been claimed by somebody else
  // on a purchase order has this email and nothing else to go on
  // (docs/dpo-decisions.md, 1 September 2026). Both facts have to be in it —
  // that the plan is not paid for, and who arranged it — and both have to be in
  // the plain-text part, which is what a stripped-HTML gateway delivers.
  const paid = staffInviteEmail(SCHOOL, LINK, null);
  const unpaid = staffInviteEmail(SCHOOL, LINK, { arrangedBy: ARRANGER });

  for (const part of [unpaid.text, unpaid.html]) {
    expect(part, "it must say the plan has not been paid for").toContain("hasn't been paid for");
    expect(part, "and name who arranged it").toContain(ARRANGER);
  }
  // And the paid one says none of it, or the disclosure means nothing.
  expect(paid.text).not.toContain("hasn't been paid for");
  expect(paid.html).not.toContain("hasn't been paid for");
  expect(paid.text).not.toContain(ARRANGER);
  expect(paid.html).not.toContain(ARRANGER);
});

test("staffInviteEmail escapes the arranger's name", () => {
  // THE SECOND piece of caller-supplied text to reach an email body, and it is
  // worse than the first: a school name is typed once at signup by somebody
  // buying a plan, while this is a display name, and the person most likely to
  // put markup in one is the squatter this disclosure exists to expose. They
  // author it, and it is delivered to a head teacher's inbox.
  const nasty = `<script>alert(1)</script>`;
  const mail = staffInviteEmail(SCHOOL, LINK, { arrangedBy: nasty });

  expect(mail.html, "raw markup from a display name must never reach the HTML body").not.toContain(
    nasty,
  );
  expect(mail.html).not.toMatch(/<script\b/i);
  expect(mail.html, "it should be escaped, not silently dropped").toContain(
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );

  const quoted = staffInviteEmail(SCHOOL, LINK, { arrangedBy: `" onmouseover="steal()` });
  expect(quoted.html).not.toContain(`onmouseover="steal()`);
  expect(quoted.html).toContain("&quot;");
});

test("staffInviteEmail escapes the school name", () => {
  // The school name is the one piece of caller-supplied text that reaches an
  // email body. An admin types it at signup, so it is untrusted (SAFEGUARDING
  // rule 15). Mail clients are not React and do not escape anything for us.
  const nasty = `<script>alert(1)</script>`;
  const mail = staffInviteEmail(nasty, LINK, null);

  expect(mail.html, "raw markup from a school name must never reach the HTML body").not.toContain(
    nasty,
  );
  expect(mail.html).not.toMatch(/<script\b/i);
  expect(mail.html, "it should be escaped, not silently dropped").toContain(
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );

  // Quotes are escaped too. The name sits between tags today, not inside an
  // attribute, so this is the assertion that keeps it safe on the day someone
  // moves it into one.
  const quoted = staffInviteEmail(`" onmouseover="steal()`, LINK, null);
  expect(quoted.html).not.toContain(`onmouseover="steal()`);
  expect(quoted.html).toContain("&quot;");
});
