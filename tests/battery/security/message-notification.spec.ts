import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { notifyDeliveredMessages } from "@/lib/messaging/notify";
import { mailAddressHmac } from "@/lib/mailHmac";

// ===========================================================================
// "There is a message waiting for you" (SAFEGUARDING rule 6b).
//
// TESTED AGAINST THE FUNCTION, NOT THROUGH A BROWSER, and that is the right
// level for once. What matters is which messages are CONSIDERED and which
// addresses are WRITTEN TO, and neither is visible on any screen. With the real
// mailer the second one is not observable at all — the test environment has no
// credentials, so every send returns "not configured" and a spec could only
// prove that nothing happened, which is FINDINGS F58's class of test exactly.
//
// So the sender is INJECTED, as the production code injects it, and this spec
// passes a recorder. Every assertion below about who was and was not written to
// is an assertion about a real list of addresses.
//
// FIVE PROPERTIES:
//
//   • NOTHING IS SENT TO A PARENT WHO HAS NOT SWITCHED IT ON. Rule 6a.
//   • A HELD MESSAGE PRODUCES NOTHING UNTIL IT IS DELIVERED. This is the one
//     that matters most: an email raised at the moment of writing would put
//     rule 21's hold in a parent's pocket at ten at night.
//   • NOTHING IS SENT TO A SUPPRESSED ADDRESS.
//   • A PARENT'S OWN MESSAGE NEVER NOTIFIES THEM.
//   • EVERY MESSAGE IS CONSIDERED EXACTLY ONCE, whatever was decided, so the
//     lazy path and the nightly sweep can race and a switch turned on in March
//     cannot produce a flood about February.
//
// The email's CONTENT is asserted separately and directly against the template,
// because "the email names nobody" is a property of the words rather than of
// the decision.
// ===========================================================================

// SUPPRESSION IS TESTED, NOT SKIPPED. `MailSuppression` stores a one-way label
// rather than an address, so without MAIL_HMAC_KEY nothing can be looked up and
// the suppression case below would skip — and a skipped test of a security
// property proves nothing at all, which is exactly what FINDINGS F58 is about.
// A fixture key is set here when the environment has none, so the case runs
// everywhere. Set only when absent, so a CI environment with a real key keeps
// it and this never quietly changes what is being tested.
process.env.MAIL_HMAC_KEY ??= "battery-fixture-key-not-a-secret";

const db = new PrismaClient();

type World = {
  schoolId: string;
  classId: string;
  onId: string;
  offId: string;
  childOnId: string;
  childOffId: string;
  addressOn: string;
  addressOff: string;
  teacherId: string;
  parentIds: string[];
  threadIds: string[];
};

async function makeSchool(tag: string): Promise<World> {
  const stamp = `${tag}-${Math.random().toString(36).slice(2, 7)}`;
  const school = await db.school.create({ data: { name: `Notify ${stamp}`, verifiedAt: new Date() } });
  await db.subscription.create({ data: { kind: "SCHOOL", status: "ACTIVE", schoolId: school.id } });
  const teacher = await db.teacher.create({
    data: {
      name: `Teacher ${stamp}`, displayName: "Teacher", email: `teacher-${stamp}@notify.test`,
      passwordHash: bcrypt.hashSync("password", 10), role: "TEACHER", status: "ACTIVE",
      schoolId: school.id, emailConfirmedAt: new Date(),
    },
  });
  const klass = await db.class.create({
    data: { name: `Robins ${stamp}`, classCode: `NT${stamp.slice(-4).toUpperCase()}`, teacherId: teacher.id, schoolId: school.id },
  });
  const childOn = await db.student.create({ data: { name: "Amara", classId: klass.id, avatarColor: "#E08A9B" } });
  const childOff = await db.student.create({ data: { name: "Bo", classId: klass.id, avatarColor: "#8AA9E0" } });

  const addressOn = `on-${stamp}@notify.test`;
  const addressOff = `off-${stamp}@notify.test`;
  const on = await db.parent.create({
    data: { familyCode: `NON${stamp.slice(-5).toUpperCase()}`, email: addressOn, notifyByEmail: true, children: { connect: { id: childOn.id } } },
  });
  // An address on file and the switch OFF, which is the default and the case
  // that must produce nothing.
  const off = await db.parent.create({
    data: { familyCode: `NOF${stamp.slice(-5).toUpperCase()}`, email: addressOff, notifyByEmail: false, children: { connect: { id: childOff.id } } },
  });

  const threads = await Promise.all(
    [childOn.id, childOff.id].map((studentId) =>
      db.messageThread.create({ data: { studentId, schoolId: school.id, classId: klass.id } }),
    ),
  );

  return {
    schoolId: school.id,
    classId: klass.id,
    onId: on.id,
    offId: off.id,
    childOnId: childOn.id,
    childOffId: childOff.id,
    addressOn,
    addressOff,
    teacherId: teacher.id,
    parentIds: [on.id, off.id],
    threadIds: threads.map((t) => t.id),
  };
}

async function teardown(w: World) {
  await db.message.deleteMany({ where: { threadId: { in: w.threadIds } } });
  await db.messageThread.deleteMany({ where: { schoolId: w.schoolId } });
  await db.parent.deleteMany({ where: { id: { in: w.parentIds } } });
  await db.student.deleteMany({ where: { class: { schoolId: w.schoolId } } });
  await db.class.deleteMany({ where: { schoolId: w.schoolId } });
  await db.auditLog.deleteMany({ where: { schoolId: w.schoolId } });
  await db.subscription.deleteMany({ where: { schoolId: w.schoolId } });
  await db.teacher.deleteMany({ where: { schoolId: w.schoolId } });
  await db.school.deleteMany({ where: { id: w.schoolId } });
}

/** A sender that records rather than sends, and reports success. */
function recorder() {
  const to: string[] = [];
  const send = async (args: { to: string }) => {
    to.push(args.to);
    return { ok: true };
  };
  return { to, send };
}

const write = (threadId: string, opts: { from: "TEACHER" | "PARENT"; deliverAt: Date; who?: string }) =>
  db.message.create({
    data: {
      threadId,
      senderType: opts.from,
      senderTeacherId: opts.from === "TEACHER" ? opts.who : null,
      senderParentId: opts.from === "PARENT" ? opts.who : null,
      messageBody: "About reading books.",
      deliverAt: opts.deliverAt,
    },
  });

test("a held message notifies nobody until it is delivered, and then only the parent who asked", async () => {
  const w = await makeSchool("hold");
  try {
    const soon = new Date(Date.now() + 60 * 60_000); // still held
    const held = await write(w.threadIds[0], { from: "TEACHER", deliverAt: soon, who: w.teacherId });

    // THE ASSERTION THIS FEATURE EXISTS TO KEEP TRUE. A message written at 21:40
    // is delivered when the school opens; a notification raised at the moment of
    // writing would put rule 21's hold in a parent's pocket at ten at night.
    const mail = recorder();
    const first = await notifyDeliveredMessages(db, mail.send, new Date());
    expect(first.considered).toBe(0);
    // NOTHING WAS WRITTEN TO. The point of the hold, asserted as a fact about
    // an address list rather than as an absence of an error.
    expect(mail.to).toEqual([]);
    expect((await db.message.findFirstOrThrow({ where: { id: held.id } })).notifiedAt).toBeNull();

    // Time passes — which is the only thing that delivers a message here, as in
    // the hold itself. Nothing is rescheduled and no job re-times anything.
    const after = new Date(soon.getTime() + 1000);
    const second = await notifyDeliveredMessages(db, mail.send, after);
    expect(second.considered).toBe(1);
    // …and now exactly one address, the one that asked.
    expect(mail.to).toEqual([w.addressOn]);
    expect((await db.message.findFirstOrThrow({ where: { id: held.id } })).notifiedAt).not.toBeNull();

    // CONSIDERED EXACTLY ONCE. The lazy path and the nightly sweep race on an
    // ordinary morning, so a second pass finding it again is the failure.
    const third = await notifyDeliveredMessages(db, mail.send, new Date(after.getTime() + 60_000));
    expect(third.considered).toBe(0);
    expect(mail.to).toEqual([w.addressOn]); // still one, not two
  } finally {
    await teardown(w);
  }
});

test("nothing is considered for a parent who never switched it on, or for their own message", async () => {
  const w = await makeSchool("off");
  try {
    const past = new Date(Date.now() - 60_000);
    // To the household with the switch OFF.
    const toOff = await write(w.threadIds[1], { from: "TEACHER", deliverAt: past, who: w.teacherId });
    // And a message the PARENT wrote, in the switched-ON household: a family
    // does not need an email about what they themselves just sent.
    const fromParent = await write(w.threadIds[0], { from: "PARENT", deliverAt: past, who: w.onId });

    const mail = recorder();
    const out = await notifyDeliveredMessages(db, mail.send, new Date());
    // The switched-off household's message IS considered — the stamp means
    // "settled", not "sent" — and the parent's own message is not, because the
    // query never selects it.
    expect(out.considered).toBe(1);
    expect(out.sent).toBe(0);
    // RULE 6a, AS A LIST: the address is on file and was not written to.
    expect(mail.to).toEqual([]);
    expect((await db.message.findFirstOrThrow({ where: { id: toOff.id } })).notifiedAt).not.toBeNull();
    // Never considered, so never stamped: a parent's own message is out of
    // scope by the query rather than by a filter somebody could drop.
    expect((await db.message.findFirstOrThrow({ where: { id: fromParent.id } })).notifiedAt).toBeNull();
  } finally {
    await teardown(w);
  }
});

test("a suppressed address is not written to", async () => {
  const w = await makeSchool("suppress");
  try {
    const hash = mailAddressHmac(w.addressOn);
    // The key is set at the top of this file when the environment has none, so
    // this is a real assertion everywhere rather than a skip on most machines.
    expect(hash).not.toBeNull();

    await db.mailSuppression.create({
      data: { addressHmac: hash as string, state: "BOUNCE", firstSeenAt: new Date(), lastSeenAt: new Date() },
    });
    try {
      await write(w.threadIds[0], { from: "TEACHER", deliverAt: new Date(Date.now() - 60_000), who: w.teacherId });
      const mail = recorder();
      const out = await notifyDeliveredMessages(db, mail.send, new Date());
      expect(out.considered).toBe(1);
      expect(out.sent).toBe(0);
      // The switch is ON for this household, so the ONLY reason nothing was
      // written to is the suppression row. A positive control follows.
      expect(mail.to).toEqual([]);
      // A POSITIVE CONTROL, so the refusal above is not the whole feature being
      // inert: the same household, the same switch, one row removed.
      await db.mailSuppression.deleteMany({ where: { addressHmac: hash as string } });
      await db.message.updateMany({ where: { threadId: w.threadIds[0] }, data: { notifiedAt: null } });
      const again = recorder();
      await notifyDeliveredMessages(db, again.send, new Date());
      expect(again.to).toEqual([w.addressOn]);
    } finally {
      await db.mailSuppression.deleteMany({ where: { addressHmac: hash as string } });
    }
  } finally {
    await teardown(w);
  }
});

test("the email names nobody: not the child, the teacher, the school, or the message", async () => {
  // Asserted against the template directly. The words are the whole of what
  // rule 6b permits, and a screen cannot show them.
  const { messageWaitingEmail } = await import("@/lib/emailTemplates");
  const mail = messageWaitingEmail("https://storyjar.example/family");
  const whole = `${mail.subject}\n${mail.text}\n${mail.html}`.toLowerCase();

  for (const forbidden of ["amara", "bo ", "robins", "mrs ", "mr ", "miss "]) {
    expect(whole).not.toContain(forbidden);
  }
  // It says a message is waiting, and where to go.
  expect(mail.subject.toLowerCase()).toContain("message");
  expect(mail.text).toContain("https://storyjar.example/family");
  // NO SIGN-IN TOKEN. The link is the family space, which asks for a code or
  // sends a magic link as it always does; a token here would be a second
  // sign-in route created by a message arriving.
  expect(whole).not.toContain("token=");
  expect(whole).not.toContain("/family/");
  // And it tells them how to stop, in the email itself.
  expect(mail.text.toLowerCase()).toContain("turn them off");
});
