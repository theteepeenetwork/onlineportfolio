"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { createSession, destroySession } from "@/lib/auth";
import { isRateLimited, recordFailure, clearFailures, clientIp, RATE_LIMITED_MESSAGE } from "@/lib/rateLimit";
import { sendMail } from "@/lib/mailer";
import { signInLinkMayBeShown } from "@/lib/signInLinkPolicy";
import { magicLinkEmail } from "@/lib/emailTemplates";
import { normaliseFamilyCode } from "@/lib/familyCodeChars";
import { getCurrentParent } from "@/lib/parentAuth";
import { recordAudit } from "@/lib/audit";
import { headers } from "next/headers";

// One throttle budget for every family-code entry, wherever it is typed: the
// sign-in form and the "add another child" form behind it (FINDINGS F2). Two
// keys would leave the second form an unmetered oracle for the first.
const codeKey = async () => `family:${await clientIp()}`;

const WRONG_CODE = "That family code isn’t right — check your letter, or ask the school office.";

// Parent asks for a magic link: we mint a single-use token and EMAIL it.
//
// The URL is never returned to the browser in production. It used to be —
// rendered as an "Open it now →" link — which meant anyone who typed a parent's
// address into this public form was handed a working session for that family.
// No tampering, no guessing: a complete authentication bypass (FINDINGS F19,
// SAFEGUARDING rules 4 and 6). Outside production the link is still returned so
// local development doesn't need a mail server, and `signInLinkMayBeShown()` is
// the single place that decides — a pure function a test can pin down.
//
// We don't reveal whether an email is on file (F6): the response is identical
// for a known address, an unknown address, and a send that failed.
export async function requestMagicLink(
  _prev: { openUrl?: string; sent?: boolean; error?: string } | undefined,
  formData: FormData,
): Promise<{ openUrl?: string; sent?: boolean; error?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  // Most parents have no address on file at all (`Parent.email` is nullable,
  // because a teacher never types one). This guard is what keeps that safe: a
  // blank or malformed submission is turned away HERE, so the lookup is only ever
  // given a real address and can never be handed an empty string to match
  // against. It could not match a NULL row in any case, since SQL equality
  // against NULL is never true, but the check is stated rather than assumed.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That email doesn’t look quite right." };
  }

  // Throttle magic-link requests per source so the endpoint can't be used to
  // spam inboxes or probe at volume (FINDINGS F2).
  const magicKey = `magic:${await clientIp()}`;
  if (isRateLimited(magicKey)) {
    return { error: RATE_LIMITED_MESSAGE };
  }
  recordFailure(magicKey);

  const parent = await db.parent.findUnique({ where: { email } });

  // Never disclose whether an email is on file (avoids account enumeration —
  // FINDINGS F6). The response is the SAME neutral "if it's on file, we've sent
  // a link" for known and unknown emails. In this build (no mail server) we only
  // hand back the direct link when a family actually matches — but the visible
  // message is identical either way, so nothing is leaked.
  if (parent) {
    const token = randomBytes(24).toString("hex");
    await db.magicToken.create({
      data: { token, parentId: parent.id, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
    });

    const path = `/family/enter?token=${token}`;
    const mail = magicLinkEmail(`${await originUrl()}${path}`);
    // Fire and await, but ignore the outcome for the RESPONSE: telling the user
    // that sending failed would leak that their address is on file (F6). A
    // failure is logged server-side by the mailer instead, and counted against
    // the template rather than the person (src/lib/mailCounters.ts).
    // `templateKey` is a constant chosen here, never derived from the address
    // or the message.
    await sendMail({
      to: email,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      templateKey: "magic-link",
    });

    // Development convenience only — never in production.
    if (signInLinkMayBeShown()) return { sent: true, openUrl: path };
  }
  return { sent: true };
}

// Absolute base URL for links inside emails. APP_URL wins where set (it is, in
// production); otherwise derive it from the request so local development and
// preview deploys produce links that actually resolve.
async function originUrl(): Promise<string> {
  const explicit = process.env.APP_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Parent signs in with the family code from their school's letter.
export async function signInWithFamilyCode(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  const code = normaliseFamilyCode(formData.get("code") as string);
  if (!code) return { error: "Enter the family code from your letter." };

  // Throttle family-code guessing per source (FINDINGS F2). A correct code
  // clears the counter.
  const key = await codeKey();
  if (isRateLimited(key)) return { error: RATE_LIMITED_MESSAGE };

  const parent = await db.parent.findUnique({ where: { familyCode: code } });
  if (!parent) {
    recordFailure(key);
    return { error: WRONG_CODE };
  }

  clearFailures(key);
  await createSession({ role: "PARENT", parentId: parent.id });
  redirect("/family");
}

// A signed-in parent adds another of their children, using the second code the
// school sent home.
//
// This is the ONLY route that puts two children behind one family sign-in, and
// it has to be the parent's, not a teacher's. The two children may be in two
// classes with two different teachers, and neither teacher may learn anything
// about the other's pupils (SAFEGUARDING rules 4 and 6). The parent is the one
// person who holds both letters, so the parent is the one who joins them up.
//
// What it will NOT do is fold two family accounts together. The code must
// belong to a place nobody has taken up yet: no email, no session, no sign-in
// link ever issued. If somebody is already using it, that is a second household
// (or the same one on a second account) and merging would silently hand one
// adult the other's access. We refuse and point at the school, who can remove
// that family's access and issue a fresh code.
export async function addChildWithFamilyCode(
  _prev: { error?: string; added?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; added?: string }> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");

  const code = normaliseFamilyCode(formData.get("code") as string);
  if (!code) return { error: "Enter the family code from your letter." };

  // Same budget as the sign-in form (FINDINGS F2); a correct code clears it.
  const key = await codeKey();
  if (isRateLimited(key)) return { error: RATE_LIMITED_MESSAGE };

  const source = await db.parent.findUnique({
    where: { familyCode: code },
    select: {
      id: true,
      email: true,
      children: { select: { id: true, name: true, class: { select: { teacher: { select: { schoolId: true } } } } } },
      _count: { select: { sessions: true, magicTokens: true } },
    },
  });
  if (!source) {
    recordFailure(key);
    return { error: WRONG_CODE };
  }
  clearFailures(key);

  if (source.id === parent.id) {
    return { error: "That’s the code you’re already signed in with." };
  }
  // Taken up by someone already. See the note above. Nothing changes.
  const claimed = source.email !== null || source._count.sessions > 0 || source._count.magicTokens > 0;
  if (claimed) {
    return {
      error: "That code has already been used to set up a family space. Ask the school office to send a new one.",
    };
  }

  const children = source.children;
  if (children.length === 0) {
    // A code with no child behind it grants nothing. Treated as a wrong code so
    // the message never hints that the code itself was real.
    return { error: WRONG_CODE };
  }

  // Move the link, then delete the empty place the code belonged to, so one
  // household is one row and one code (and no orphan is left holding a working
  // code). Deleting it cascades nothing of value: it has no sessions, no
  // tokens, no address, which is what `claimed` just proved.
  await db.$transaction([
    db.parent.update({
      where: { id: parent.id },
      data: { children: { connect: children.map((c) => ({ id: c.id })) } },
    }),
    db.parent.delete({ where: { id: source.id } }),
  ]);

  for (const child of children) {
    await recordAudit({
      action: "FAMILY_CHILD_LINKED",
      actorType: "PARENT",
      actorId: parent.id,
      schoolId: child.class.teacher.schoolId,
      subjectType: "STUDENT",
      subjectId: child.id,
      detail: `A family added ${child.name} to their existing family space`,
    });
  }

  revalidatePath("/family");
  return { added: children.map((c) => c.name).join(", ") };
}

// A parent tells Storyjar who they are and where to send a sign-in link.
//
// Nobody else can do this, which is the whole point of the design: a teacher
// creates a family place holding a code and nothing else, and every contact
// detail Storyjar ever holds for a parent was typed by that parent, here, about
// themselves. Both fields are optional and both can be cleared again.
export async function saveFamilyDetails(
  _prev: { error?: string; saved?: boolean } | undefined,
  formData: FormData,
): Promise<{ error?: string; saved?: boolean }> {
  const parent = await getCurrentParent();
  if (!parent) redirect("/family");

  const rawName = String(formData.get("name") ?? "").trim().slice(0, 80);
  const rawEmail = String(formData.get("email") ?? "").trim().toLowerCase();

  if (rawEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(rawEmail)) {
    return { error: "That email doesn’t look quite right." };
  }

  try {
    await db.parent.update({
      where: { id: parent.id },
      // Empty means "don't hold this" rather than an empty string, so a parent
      // can take their address back off Storyjar as easily as they gave it.
      data: { name: rawName || null, email: rawEmail || null },
    });
  } catch {
    // Almost certainly the unique-email constraint. We do NOT say so: confirming
    // that an address is already on file would turn this form into the account
    // check the sign-in form is careful not to be (FINDINGS F6). The school can
    // sort out a family holding two spaces.
    return { error: "We couldn’t save that email address. Please check it, or speak to the school office." };
  }

  // Audit the thing that matters: an address is a new route into a child's jar
  // (it can be sent a sign-in link), so its arrival and its removal are both
  // recorded, never the address itself and never a child's name. Saving a
  // name alone changes no access and needs no entry.
  const emailChanged = (parent.email ?? "") !== rawEmail;
  if (emailChanged) {
    await recordAudit({
      action: rawEmail ? "FAMILY_EMAIL_ADDED" : "FAMILY_EMAIL_REMOVED",
      actorType: "PARENT",
      actorId: parent.id,
      subjectType: "PARENT",
      subjectId: parent.id,
      detail: rawEmail
        ? "A parent added their own email address for sign-in links"
        : "A parent removed their email address",
    });
  }

  revalidatePath("/family");
  return { saved: true };
}

export async function parentLogout() {
  await destroySession();
  redirect("/family");
}
