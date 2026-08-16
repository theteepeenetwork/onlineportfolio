import "server-only";

// ---------------------------------------------------------------------------
// The emails Storyjar sends. Two of them.
//
// **Every word here is fixed copy.** Nothing a child wrote, nothing a teacher
// typed, and no child's name is ever interpolated into an email. A school holds
// the parent's address, not us, and schools mistype addresses — so a message
// that lands with the wrong person must give away nothing about a child. Read
// each template below as if a stranger opened it: they learn only that someone
// asked to sign in to a service, and nothing about any child.
//
// Plain text is written first and carries the whole message. The HTML is a thin
// wrapper: no images, no web fonts, no external CSS, and no open pixel of our
// own. School mail filters are aggressive and an authentication email that
// lands in junk is the same as no email at all.
//
// "Of our own" is doing real work in that sentence. What we generate here is
// clean. What a parent receives is whatever the sending provider chose to make
// of it, and a provider has already been observed adding an open pixel to a
// message sent with tracking explicitly disabled. So nothing in this file can
// promise what reaches a parent, whoever is sending: the templates below are
// evidence about our own output only.
//
// That holds for every provider, not the one that did it. Do not soften this
// note when the provider changes; the only thing that would justify softening
// it is reading the raw source of a delivered message. See the note in
// mailer.ts, and scripts/verify-mail.mjs.
// ---------------------------------------------------------------------------

const REPLY_HINT = "If you didn't ask for this, you can ignore this email — nothing will happen.";

function wrap(bodyHtml: string): string {
  return `<!doctype html><html lang="en"><body style="margin:0;padding:24px;background:#FFFDF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#22304A;line-height:1.55;">
<div style="max-width:520px;margin:0 auto;">
<p style="font-size:20px;font-weight:700;margin:0 0 18px;">Storyjar</p>
${bodyHtml}
<p style="margin:28px 0 0;font-size:13px;color:#5b6379;">Storyjar — a learning journal for primary schools. You can reply to this email and a real person will read it.</p>
</div></body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="display:inline-block;background:#bd3f63;color:#FFFDF7;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:999px;">${label}</a></p>
<p style="margin:0;font-size:13px;color:#5b6379;">If the button doesn't work, copy this link into your browser:<br><span style="word-break:break-all;">${href}</span></p>`;
}

/**
 * The parent's one-tap sign-in link.
 *
 * Note what is NOT here: the child's name, their class, their school, and any
 * mention of what is waiting for them. "Your child's" is as specific as it gets.
 */
export function magicLinkEmail(url: string): { subject: string; text: string; html: string } {
  const subject = "Your Storyjar sign-in link";
  const text = [
    "Here's your link to sign in to Storyjar and see your child's work.",
    "",
    url,
    "",
    "The link works once and lasts 30 minutes. If it expires, just ask for another one.",
    "",
    REPLY_HINT,
    "",
    "Storyjar — a learning journal for primary schools.",
    "You can reply to this email and a real person will read it.",
  ].join("\n");

  const html = wrap(
    `<p style="margin:0;font-size:17px;">Here's your link to sign in to Storyjar and see your child's work.</p>
${button(url, "Sign in to Storyjar")}
<p style="margin:20px 0 0;font-size:15px;">The link works once and lasts 30 minutes. If it expires, just ask for another one.</p>
<p style="margin:12px 0 0;font-size:15px;color:#5b6379;">${REPLY_HINT}</p>`,
  );

  return { subject, text, html };
}

/**
 * A staff invitation. Adults only, and it names the school (which the recipient
 * works at) but never a class roster or any child.
 */
export function staffInviteEmail(schoolName: string, url: string): { subject: string; text: string; html: string } {
  const subject = `You've been invited to Storyjar`;
  const text = [
    `You've been added to ${schoolName}'s Storyjar account by a colleague.`,
    "",
    "Set your password and get started here:",
    url,
    "",
    REPLY_HINT,
    "",
    "Storyjar — a learning journal for primary schools.",
    "You can reply to this email and a real person will read it.",
  ].join("\n");

  const html = wrap(
    `<p style="margin:0;font-size:17px;">You've been added to <strong>${escapeHtml(schoolName)}</strong>'s Storyjar account by a colleague.</p>
${button(url, "Set your password")}
<p style="margin:20px 0 0;font-size:15px;color:#5b6379;">${REPLY_HINT}</p>`,
  );

  return { subject, text, html };
}

// The school name is the one piece of caller-supplied text that reaches an
// email body, so it is escaped rather than trusted.
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}
