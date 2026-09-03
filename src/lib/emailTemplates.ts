// ---------------------------------------------------------------------------
// The emails StoryJar sends. FIVE of them: the parent's sign-in link, a
// teacher's password reset, a staff invitation, the confirm-your-address mail
// sent before a school can buy, and the school invitation that tells a teacher
// who ALREADY has an account that an offer is waiting for them in the app.
//
// This line said "Three of them" until 2 September 2026, when there were four.
// It is corrected rather than deleted because the counts in this file are the
// point: the one further down, over `escapeHtml`, counts the untrusted strings,
// and a habit of letting a count go stale is how that one goes stale too.
//
// **This module deliberately does NOT import `server-only`.** Its predecessor,
// `src/lib/emails.ts`, did, and the cost of that guard was that nothing outside
// a server component could read these templates. Two things followed, both bad:
// `scripts/verify-mail.mjs` had to carry a hand-written copy of an email, so the
// delivery probe proved the transport worked while saying nothing about the
// message a parent actually receives; and no test could assert anything about
// the templates, so "no images, ever" lived only in the comment below.
//
// The guard is safe to drop here because these are pure functions of a URL (and,
// for the staff invite, a school name). They hold no secret, read no
// environment variable, touch no database, and reach no network. There is
// nothing in this file that would harm anyone if it were bundled into a browser.
// The template that a blocking test can read is worth more than an import that
// only stops a mistake nobody has made.
//
// **What would reverse that decision.** If a template ever needs an API key, an
// environment value, a database read, or anything else that must not reach a
// client bundle, it belongs back behind `server-only` and the test has to find
// another way in. The same reasoning, and the same escape hatch, is written up
// in `src/lib/signInLinkPolicy.ts`, which was extracted for exactly this reason.
//
// The sending side stays where it was: `src/lib/mailer.ts` keeps `server-only`,
// because that is the file holding the credentials.
//
// ---------------------------------------------------------------------------
//
// **Nothing a child wrote, and no child's name, is ever interpolated into an
// email.** A school holds the parent's address, not us, and schools mistype
// addresses, so a message that lands with the wrong person must give away
// nothing about a child. Read each template below as if a stranger opened it:
// they learn only that someone asked to sign in to a service for primary
// schools, and nothing about any child.
//
// THREE ADULT-typed values reach a body, across two templates: the school's
// name (the staff invitation and the school invitation), the name of the admin
// who arranged an UNPAID school's staff invitation, and the name of the admin
// who sent a school invitation. All three are escaped (`escapeHtml`, at the
// foot of this file, which counts them again for the same reason). This
// paragraph used to say that every word here was fixed copy and that nothing a
// teacher typed was interpolated; the school name was already an exception when
// it said so, and an undercount of what is untrusted is how the next one
// arrives unescaped.
//
// **There are no images. Not one, not even a logo.** Three reasons, in order of
// importance:
//   1. An <img> is how open tracking works. Sending none means "no pixel" is a
//      property of the message we can prove by reading its source, rather than a
//      promise about a provider's settings. `scripts/verify-mail.ts` checks the
//      delivered message; `tests/battery/security/email-templates.spec.ts`
//      checks what we generate, and blocks the build if an image appears.
//   2. Most mail clients block remote images by default, so a logo-led design
//      arrives broken for the majority of recipients anyway.
//   3. Image-heavy mail with little text scores badly with spam filters. A
//      sign-in link in a junk folder is the same as no sign-in link.
//
// Plain text is written first and carries the whole message. The HTML mirrors
// it: inline styles only, no web fonts, no external CSS, table layout so it
// survives Outlook. School mail filters are aggressive and an authentication
// email that lands in junk is the same as no email at all.
// ---------------------------------------------------------------------------

const CREAM_PAGE = "#F5EFE3";
const CREAM_CARD = "#FFFDF7";
const INK = "#22304A";
const BODY = "#3D4A63";
const MUTED = "#6E7889";
const RASPBERRY = "#BD3F63";
const RULE = "#E8DECB";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

const FOOTER_TEXT =
  "StoryJar is a learning journal for primary schools. A child's work is only ever seen by their teacher and their own family.";
const REPLY_TEXT = "You can reply to this email and a real person will read it.";

/**
 * The shared shell: hidden preheader, wordmark, cream card, footer.
 *
 * `preheader` is the grey line a phone shows under the subject in the inbox
 * list. Left unset, clients scrape the first words of the body instead, which
 * looks careless. It is hidden in the message itself.
 */
function shell(preheader: string, cardHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>StoryJar</title>
</head>
<body style="margin:0;padding:0;background:${CREAM_PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM_PAGE};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.2px;color:${RASPBERRY};">StoryJar</td></tr>

<tr><td style="background:${CREAM_CARD};border:1px solid ${RULE};border-radius:16px;padding:32px 28px;font-family:${FONT};">
${cardHtml}
</td></tr>

<tr><td style="padding:20px 4px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">
<p style="margin:0 0 6px;">${FOOTER_TEXT}</p>
<p style="margin:0;">${REPLY_TEXT}</p>
</td></tr>
</table>

</td></tr>
</table>
</body>
</html>`;
}

/** A table-based button. Renders as a real filled shape in Outlook too. */
function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 22px;">
<tr><td align="center" bgcolor="${RASPBERRY}" style="border-radius:999px;">
<a href="${href}" style="display:inline-block;padding:15px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:${CREAM_CARD};text-decoration:none;border-radius:999px;">${label}</a>
</td></tr>
</table>`;
}

/**
 * The parent's one-tap sign-in link.
 *
 * Note what is NOT here: the child's name, their class, their school, and any
 * mention of what is waiting for them. "Your child's" is as specific as it gets.
 */
export function magicLinkEmail(url: string): { subject: string; text: string; html: string } {
  const subject = "Your StoryJar sign-in link";
  const preheader = "Tap to sign in. The link works once and lasts 30 minutes.";

  const text = [
    "Here's your sign-in link",
    "",
    "Tap the link below to sign in to StoryJar and see your child's latest work.",
    "",
    url,
    "",
    "The link works once and lasts 30 minutes. If it runs out, just ask for a new",
    "one from the sign-in page and we'll send another straight away.",
    "",
    "Didn't ask for this? You can ignore this email. Nothing will happen, and",
    "nobody has been given access to anything.",
    "",
    "---",
    FOOTER_TEXT,
    REPLY_TEXT,
  ].join("\n");

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">Here's your sign-in link</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">Tap the button below to sign in to StoryJar and see your child's latest work.</p>
${button(url, "Sign in to StoryJar")}
<p style="margin:0;font-size:15px;line-height:1.6;color:${BODY};">The link works once and lasts 30 minutes. If it runs out, just ask for a new one from the sign-in page and we'll send another straight away.</p>
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Didn't ask for this? You can ignore this email. Nothing will happen, and nobody has been given access to anything.</p>`,
  );

  return { subject, text, html };
}

/**
 * A teacher's password reset link.
 *
 * Named nowhere in it: the school, the class, any child, and the teacher
 * themselves. Anyone may type an address into the reset form, so this message
 * has to be safe to arrive at an address that was mistyped or that belongs to
 * somebody else entirely — a stranger who opens it learns that somebody asked
 * to reset a password on a service for primary schools, and nothing more.
 *
 * The reassurance at the bottom is not politeness. An unexpected password reset
 * email is alarming, the honest answer is that ignoring it changes nothing, and
 * a recipient who is told that is a recipient who does not click the link to
 * "check".
 */
export function passwordResetEmail(url: string): { subject: string; text: string; html: string } {
  const subject = "Reset your StoryJar password";
  const preheader = "Set a new password. The link works once and lasts 30 minutes.";

  const text = [
    "Reset your password",
    "",
    "Someone asked to reset the password for this StoryJar account. Use the link",
    "below to choose a new one.",
    "",
    url,
    "",
    "The link works once and lasts 30 minutes. If it runs out, ask for a new one",
    "from the sign-in page and we'll send another straight away.",
    "",
    "Didn't ask for this? You can ignore this email. Nothing will happen, your",
    "password stays as it is, and nobody has been given access to anything.",
    "",
    "---",
    FOOTER_TEXT,
    REPLY_TEXT,
  ].join("\n");

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">Reset your password</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">Someone asked to reset the password for this StoryJar account. Use the button below to choose a new one.</p>
${button(url, "Choose a new password")}
<p style="margin:0;font-size:15px;line-height:1.6;color:${BODY};">The link works once and lasts 30 minutes. If it runs out, ask for a new one from the sign-in page and we'll send another straight away.</p>
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Didn't ask for this? You can ignore this email. Nothing will happen, your password stays as it is, and nobody has been given access to anything.</p>`,
  );

  return { subject, text, html };
}

/**
 * A staff invitation. Adults only, and it names the school (which the recipient
 * works at) but never a class roster or any child.
 *
 * `unpaid` IS THE ONLY CONTROL IN THIS WHOLE FEATURE THAT REACHES SOMEBODY WHO
 * HAS NOT SIGNED UP YET, and that is why it is here rather than on a screen
 * (docs/dpo-decisions.md, 1 September 2026). Anyone can create a teacher account
 * with any school name — signup verifies no email address (F67) — and then buy
 * that school on a purchase order, which costs nothing up front and leaves the
 * school unverified for the length of the payment terms. The three admin gates
 * protect the people already inside. A real head teacher who receives one of
 * these is outside, and all they have to go on is what this message says: that
 * the plan has not been paid for, and the name of the person who arranged it.
 * If that name means nothing to them, that is the signal.
 *
 * Pass `null` when the school's payment has been confirmed. It is a required
 * argument rather than an optional one so that a new caller has to decide,
 * instead of getting the quiet half of the choice by leaving it out.
 */
export function staffInviteEmail(
  schoolName: string,
  url: string,
  unpaid: { arrangedBy: string } | null,
): { subject: string; text: string; html: string } {
  const subject = "You've been invited to StoryJar";
  const preheader = "Set your password and you're in. Takes about a minute.";

  // Ahead of the link in both parts, because it is the thing the recipient
  // needs in order to decide whether to press it at all.
  const unpaidText = unpaid
    ? [
        "Before you do:",
        "",
        `${schoolName}'s StoryJar plan hasn't been paid for yet — it was bought on a`,
        "purchase order, and the invoice has 30 days to run. This invitation was sent",
        `by ${unpaid.arrangedBy}.`,
        "",
        "If that name means nothing to you, please don't set a password. Reply to this",
        "email instead and we'll check who set the account up before anybody joins.",
        "",
      ]
    : [];

  const text = [
    "You've been invited to StoryJar",
    "",
    `A colleague has added you to ${schoolName}'s StoryJar account.`,
    "",
    ...unpaidText,
    "Set your password here and you're in:",
    url,
    "",
    "Didn't expect this? You can ignore this email. Nothing will happen, and",
    "nobody has been given access to anything.",
    "",
    "---",
    FOOTER_TEXT,
    REPLY_TEXT,
  ].join("\n");

  // No colour, no icon and no border: a bordered "warning" box is the shape a
  // phishing message imitates, and half of mail clients would render it wrong
  // anyway. It is ordinary body text, above the button, saying the two facts.
  const unpaidHtml = unpaid
    ? `<p style="margin:14px 0 0;font-size:15px;line-height:1.6;color:${BODY};"><strong style="color:${INK};">Before you do:</strong> ${escapeHtml(schoolName)}'s StoryJar plan hasn't been paid for yet — it was bought on a purchase order, and the invoice has 30 days to run. This invitation was sent by <strong style="color:${INK};">${escapeHtml(unpaid.arrangedBy)}</strong>. If that name means nothing to you, please don't set a password. Reply to this email instead and we'll check who set the account up before anybody joins.</p>`
    : "";

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">You've been invited to StoryJar</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">A colleague has added you to <strong style="color:${INK};">${escapeHtml(schoolName)}</strong>'s StoryJar account.</p>
${unpaidHtml}
${button(url, "Set your password")}
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Didn't expect this? You can ignore this email. Nothing will happen, and nobody has been given access to anything.</p>`,
  );

  return { subject, text, html };
}

/**
 * Prove that this mailbox answers, before a school becomes anybody's.
 *
 * Sent from the two CLAIM purchase routes — the ones that bring a `School` into
 * existence and make the buyer its admin (docs/dpo-decisions.md, 2 Sep 2026) —
 * AND from `joinSchoolPlan`, where a teacher answers a school's invitation and
 * a class of children's work changes hands. Free signup sends nothing and asks
 * for nothing.
 *
 * TWO OPENINGS, ONE LINK. The `reason` picks which of the two is true; the
 * link, the clock and the stamp it writes are identical, and the stamp opens
 * both doors. The variants exist because of who reads this message rather than
 * for tidiness: see the paragraph below. A buyer's letter handed to somebody
 * answering an invitation would tell the one reader who most needs to act that
 * money is being spent, which is exactly the claim a real head teacher would
 * dismiss as spam because they are not buying anything.
 *
 * THE LAST PARAGRAPH IS THE POINT OF THE WHOLE EMAIL, and it is written for a
 * reader the rest of the product cannot reach. Signup verifies no address
 * (F67), so the person holding this message may be a head teacher whose address
 * a stranger typed in order to claim their school. For them, "didn't expect
 * this?" is not a footnote: it is the first time anybody has told them it is
 * happening, and the instruction has to be DO NOT OPEN THE LINK — opening it is
 * what completes the squatter's proof. That is why this one says "reply and
 * tell us" where the reset says "you can ignore this".
 *
 * NO CALLER-SUPPLIED TEXT REACHES THIS BODY, deliberately. Not the school name,
 * not the buyer's name. Naming the school would tell whoever received a
 * mistyped address which school somebody is claiming — a small disclosure, but
 * an unnecessary one — and it would put a third untrusted string into an email
 * body (see `escapeHtml` below, and the comment about counting them).
 */
export type EmailConfirmationReason = "purchase" | "invitation";

export function emailConfirmationEmail(
  url: string,
  reason: EmailConfirmationReason = "purchase",
): { subject: string; text: string; html: string } {
  const invitation = reason === "invitation";
  const subject = "Confirm your email address for StoryJar";
  const preheader = "One link, so we know we can reach you. It lasts 24 hours.";

  // WHAT IS HAPPENING, in one sentence, for a reader who may not have signed up
  // at all. Neither variant names a school, a colleague or a price — the same
  // rule the rest of this body keeps.
  const opening = invitation
    ? [
        "Someone with this email address is answering an invitation to join a",
        "school on StoryJar. Before a school can take on a class of children's",
        "work, we need to know we can reach you here.",
      ]
    : [
        "Someone is setting up a school plan on StoryJar with this email address.",
        "Before anything is bought or charged, we need to know we can reach you here.",
      ];
  const openingHtml = invitation
    ? "Someone with this email address is answering an invitation to join a school on StoryJar. Before a school can take on a class of children&rsquo;s work, we need to know we can reach you here."
    : "Someone is setting up a school plan on StoryJar with this email address. Before anything is bought or charged, we need to know we can reach you here.";
  const againButton = invitation ? "the Join button" : "the buy button";
  // The reassurance at the end has to be TRUE of the door that sent it. On the
  // invitation route nothing is being bought at all, so "nothing has been
  // charged" alone would answer a question this reader is not asking and leave
  // the one they are — has anybody been given my school? — unanswered.
  const nothingHappened = invitation
    ? "Nobody has joined anything and nothing has been charged."
    : "Nothing has been bought and nothing has been charged.";

  const text = [
    "Confirm your email address",
    "",
    ...opening,
    "",
    url,
    "",
    "The link works once and lasts 24 hours. If it runs out, go back to StoryJar",
    `and press ${againButton} again — we'll send a fresh one straight away.`,
    "",
    "Didn't set up a StoryJar account? Then somebody has used your address, by",
    "mistake or otherwise. Please do NOT open the link. Reply to this email",
    `instead and a real person will sort it out. ${nothingHappened}`,
    "",
    "---",
    FOOTER_TEXT,
    REPLY_TEXT,
  ].join("\n");

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">Confirm your email address</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">${openingHtml}</p>
${button(url, "Confirm this address")}
<p style="margin:0;font-size:15px;line-height:1.6;color:${BODY};">The link works once and lasts 24 hours. If it runs out, go back to StoryJar and press ${againButton} again — we'll send a fresh one straight away.</p>
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};"><strong>Didn't set up a StoryJar account?</strong> Then somebody has used your address, by mistake or otherwise. Please do not open the link. Reply to this email instead and a real person will sort it out. ${nothingHappened}</p>`,
  );

  return { subject, text, html };
}

/**
 * An offer to join a school, for somebody who ALREADY has a StoryJar account.
 *
 * THIS EMAIL MINTS NOTHING AND ACCEPTS NOTHING. It carries no token, no code
 * and no credential of any kind: `url` is the recipient's own `/teacher` page,
 * and the offer is answered in the app by the signed-in holder of the account
 * (docs/dpo-decisions.md, 2 September 2026). Compare `staffInviteEmail`, which
 * has to mail a credential because the person receiving it has no account to
 * sign in to. This one does, so a forwardable bearer token whose payload is
 * "attach my pupils to this school" would be a third credential bought for
 * nothing — and a mistyped address would reach somebody who cannot act on it
 * at all, because the invitation is bound to a teacher id rather than to
 * whoever opened an email.
 *
 * IT NAMES THE INVITER, and that is the same reasoning as the unpaid-school
 * disclosure one function up: a recipient has to be able to judge whether this
 * is legitimate, and a name they recognise — or plainly do not — is the only
 * thing in the message that lets them. It costs the inviter's name to somebody
 * who was going to be told it on the acceptance screen anyway.
 *
 * IT SAYS IGNORING IT IS SAFE, in both parts, because that is TRUE here in a
 * way it is not of the confirm-your-address mail: an unanswered invitation
 * lapses on its own after fourteen days and changes nothing about the
 * recipient's classes, pupils or account meanwhile.
 *
 * TWO caller-supplied strings reach this body — the school's name and the
 * inviter's — and both are escaped. Neither is checked against anything
 * (SAFEGUARDING rule 15).
 */
export function schoolInvitationEmail(
  schoolName: string,
  invitedByName: string,
  url: string,
): { subject: string; text: string; html: string } {
  // Fixed copy, built from nothing. A subject line is visible on a lock screen
  // to anybody holding the phone, so it names neither the school nor a person.
  const subject = "There's an invitation waiting for you on StoryJar";
  const preheader = "Sign in when you have a minute — there's nothing to do in this email.";

  const text = [
    "An invitation is waiting for you on StoryJar",
    "",
    `${invitedByName} has invited you to join ${schoolName} on StoryJar.`,
    "",
    "There is nothing to accept in this email, and no link in it agrees to",
    "anything. The invitation is waiting inside StoryJar: sign in as you normally",
    "do and you'll find it on your own page, with what joining would mean for",
    "your classes and your pupils set out in full before you answer.",
    "",
    url,
    "",
    "Don't recognise that name or that school? You can ignore this email, and",
    "ignoring it is safe. Nothing about your account, your classes or your pupils",
    "changes, and the invitation runs out on its own if you never answer it.",
    "",
    "---",
    FOOTER_TEXT,
    REPLY_TEXT,
  ].join("\n");

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">An invitation is waiting for you on StoryJar</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};"><strong style="color:${INK};">${escapeHtml(invitedByName)}</strong> has invited you to join <strong style="color:${INK};">${escapeHtml(schoolName)}</strong> on StoryJar.</p>
<p style="margin:14px 0 0;font-size:16px;line-height:1.6;color:${BODY};">There is nothing to accept in this email, and no link in it agrees to anything. The invitation is waiting inside StoryJar: sign in as you normally do and you&rsquo;ll find it on your own page, with what joining would mean for your classes and your pupils set out in full before you answer.</p>
${button(url, "Sign in to StoryJar")}
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn&rsquo;t work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};"><strong>Don&rsquo;t recognise that name or that school?</strong> You can ignore this email, and ignoring it is safe. Nothing about your account, your classes or your pupils changes, and the invitation runs out on its own if you never answer it.</p>`,
  );

  return { subject, text, html };
}

// THREE pieces of caller-supplied text reach an email body, and all three go
// through here rather than being trusted: the school's name (on the staff
// invitation AND the school invitation), the name of the admin who arranged an
// unpaid school's staff invitation, and the name of the admin who sent a school
// invitation. Each is typed by an adult at signup or into a form and none is
// checked against anything (SAFEGUARDING rule 15), and a mail client is not
// React: nothing escapes for us.
//
// This comment said "the school name is the only such text" until the unpaid
// disclosure landed, and "TWO" until the school invitation landed on 2
// September 2026. Both corrections are recorded rather than quietly reworded
// because the count is the point: a comment that undercounts what is untrusted
// is how the fourth one arrives unescaped.
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
