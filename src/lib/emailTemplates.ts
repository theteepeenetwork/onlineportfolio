// ---------------------------------------------------------------------------
// The emails Storyjar sends. Two of them.
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
// **Every word here is fixed copy.** Nothing a child wrote, nothing a teacher
// typed, and no child's name is ever interpolated into an email. A school holds
// the parent's address, not us, and schools mistype addresses, so a message that
// lands with the wrong person must give away nothing about a child. Read each
// template below as if a stranger opened it: they learn only that someone asked
// to sign in to a service for primary schools, and nothing about any child.
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
  "Storyjar is a learning journal for primary schools. A child's work is only ever seen by their teacher and their own family.";
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
<title>Storyjar</title>
</head>
<body style="margin:0;padding:0;background:${CREAM_PAGE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CREAM_PAGE};">
<tr><td align="center" style="padding:32px 16px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 4px 16px;font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.2px;color:${RASPBERRY};">Storyjar</td></tr>

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
  const subject = "Your Storyjar sign-in link";
  const preheader = "Tap to sign in. The link works once and lasts 30 minutes.";

  const text = [
    "Here's your sign-in link",
    "",
    "Tap the link below to sign in to Storyjar and see your child's latest work.",
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
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">Tap the button below to sign in to Storyjar and see your child's latest work.</p>
${button(url, "Sign in to Storyjar")}
<p style="margin:0;font-size:15px;line-height:1.6;color:${BODY};">The link works once and lasts 30 minutes. If it runs out, just ask for a new one from the sign-in page and we'll send another straight away.</p>
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Didn't ask for this? You can ignore this email. Nothing will happen, and nobody has been given access to anything.</p>`,
  );

  return { subject, text, html };
}

/**
 * A staff invitation. Adults only, and it names the school (which the recipient
 * works at) but never a class roster or any child.
 */
export function staffInviteEmail(
  schoolName: string,
  url: string,
): { subject: string; text: string; html: string } {
  const subject = "You've been invited to Storyjar";
  const preheader = "Set your password and you're in. Takes about a minute.";

  const text = [
    "You've been invited to Storyjar",
    "",
    `A colleague has added you to ${schoolName}'s Storyjar account.`,
    "",
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

  const html = shell(
    preheader,
    `<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:700;color:${INK};">You've been invited to Storyjar</h1>
<p style="margin:0;font-size:16px;line-height:1.6;color:${BODY};">A colleague has added you to <strong style="color:${INK};">${escapeHtml(schoolName)}</strong>'s Storyjar account.</p>
${button(url, "Set your password")}
<div style="height:1px;background:${RULE};margin:24px 0;line-height:1px;font-size:0;">&nbsp;</div>
<p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:${MUTED};">If the button doesn't work, copy and paste this into your browser:</p>
<p style="margin:0 0 18px;font-size:13px;line-height:1.6;color:${MUTED};word-break:break-all;">${url}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:${MUTED};">Didn't expect this? You can ignore this email. Nothing will happen, and nobody has been given access to anything.</p>`,
  );

  return { subject, text, html };
}

// The school name is the one piece of caller-supplied text that reaches an
// email body, so it is escaped rather than trusted.
function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
