import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signIn } from "./actions";

// ===========================================================================
// Mrs Hartley runs the account, not a classroom.
//
// She is the person the school's data protection lead asks questions of, the
// person who gets the invoice, and the person who has to do the September jobs:
// staff who have left, staff who have joined, classes that move up a year, and
// families who should no longer have access.
//
// None of that is teaching, and all of it is the reason the school renews.
// ===========================================================================

test.use({ persona: TEAM.schoolAdmin });

test("the September jobs: staff in, staff out, classes moved on", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.admin);
  await t.open("/admin", "the whole-school console");

  // --- A new member of staff ---------------------------------------------
  await carryOn(async () => {
    const invite = page.getByRole("button", { name: /invite staff/i }).first();
    if (!(await t.sees(invite))) {
      t.say("blocker", "stuck", "I cannot find any way to add a member of staff to our account.");
      return;
    }
    await t.act("invite a new teacher", async () => invite.click());
    await t.sweep("the invite panel");

    const email = `new.starter.${Date.now().toString().slice(-6)}@bramblewood.test`;
    await t.act("fill in their details", async () => {
      await page.locator("#inv-name").fill("Jamie Newstarter");
      await page.locator("#inv-email").fill(email);
    });

    // The question an admin has to be able to answer to the head: what will this
    // person be able to see?
    t.expects(
      // "access" alone was on this screen whatever it said, so this asks for
      // the actual promise the panel makes about what a role can reach. The
      // panel does say it — "Teacher and teaching assistant can do the same
      // things — give them a class to decide what they see" — so this check
      // passes honestly rather than by accident, and will notice if the
      // sentence is ever dropped.
      await t.seesText(
        /can do the same things|decide what they see|will only see|opens this console|their own class/i,
        1500,
      ),
      "major",
      "confusing",
      "The invite form does not tell me what the person I am inviting will be able to see. I am granting access to children's photographs and I am guessing.",
    );

    await t.act("send the invite", async () => {
      await page.getByRole("button", { name: /send invite/i }).click();
    });

    const appeared = await t.seesText(/jamie newstarter/i, 4000);
    t.expects(appeared, "major", "stuck", "I sent the invite and the person did not appear in the staff list, so I do not know whether it worked.");

    // Did it actually send? An invite that silently fails is a member of staff
    // ringing you on Monday saying they never got anything.
    t.expects(
      await t.seesText(/invited|\bsent\b|pending/i, 2000),
      "minor",
      "confusing",
      "Nothing tells me whether the invite email was actually sent, or when. If it bounced I would never know.",
    );
    t.budget(6, "Inviting a member of staff");
  });

  // --- Somebody who has left ----------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await t.open("/admin", "the whole-school console");
    const actions = page.getByRole("button", { name: new RegExp(`actions for ${ACADEMY.removableStaff.name}`, "i") }).first();
    if (!(await t.sees(actions))) {
      t.say("major", "stuck", "I cannot find the controls for an individual member of staff.");
      return;
    }
    await t.act("open their menu", async () => actions.click());
    await t.sweep("the staff row menu");

    const remove = page.getByRole("menuitem", { name: /remove|delete|revoke/i }).first();
    if (!(await t.sees(remove))) {
      t.say(
        "major",
        "stuck",
        "There is no way to remove a member of staff who has left. Their access to children's work stays live until somebody rings support.",
      );
      return;
    }

    await t.act("remove them", async () => remove.click());

    // Removing a person's access to children's data is not an "undo" job. It
    // should say what happens to their classes and their work.
    // WRITTEN FROM THE SCREEN, and it is F59's discovery site.
    //
    // The old pattern was /class(es)?|work|cannot be undone|permanent|sure/i.
    // The page after removing somebody contains "Classes" as a nav item and as
    // a stat tile, so it passed on every run since the day it was written and
    // this journey has never once tested what it says it tests. What it was
    // hiding: removal is a single click with no confirmation, it does not
    // revoke the person's access, and it takes the classes out of the school.
    //
    // So this asks for the sentence a head teacher needs before an
    // irreversible click, and asks for it by its meaning rather than by a word
    // that is bound to be somewhere on an admin console.
    const explained = await t.seesText(
      /what happens to (their|the) class|their classes will|access (will )?end|no longer (be able to )?see|are you sure|cannot be undone/i,
      2000,
    );
    t.expects(
      explained,
      "major",
      "fragile",
      "Removing a member of staff happened without telling me what becomes of the classes they taught or the work they published. If their classes go with them, I have just deleted children's work by accident.",
    );

    const confirm = page.getByRole("button", { name: /remove|yes|confirm|delete/i }).first();
    if (await t.sees(confirm, 1500)) await t.act("confirm", async () => confirm.click());
    t.budget(5, "Removing a member of staff who has left");
  });

  // --- Moving the school up a year ----------------------------------------
  // The single biggest job in a primary school's year, done in one week every
  // August by somebody in Mrs Hartley's chair.
  await carryOn(async () => {
    t.newJob();
    await t.open("/admin", "the whole-school console");
    const classesTab = page.getByRole("button", { name: /^classes$/i }).first();
    if (await t.sees(classesTab)) {
      await t.act("look at our classes", async () => classesTab.click());
      await t.sweep("the whole-school class list");
    }

    const rollover = page.getByRole("button", { name: /move up|next year|roll ?over|promote|new (academic )?year|end of year/i }).first();
    const found = await t.sees(rollover, 2000);
    t.expects(
      found,
      "major",
      "stuck",
      "There is nothing anywhere for the September job: moving each class up a year and handing it to its new teacher. Doing it by hand means recreating every class, re-typing every child's name, and re-issuing every code and letter — and last year's work does not follow the child.",
      "checked the whole-school console and the class list",
    );
  });

  // --- What the DPO will ask -----------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await t.open("/admin", "the whole-school console");
    const audit = page.getByRole("button", { name: /audit/i }).first();
    if (!(await t.sees(audit))) {
      t.say("major", "stuck", "There is no record of who did what. I cannot answer 'who published that photograph?'.");
      return;
    }
    await t.act("open the audit log", async () => audit.click());
    await t.sweep("the audit log");

    t.expects(
      await t.seesText(/invite|\brole\b|staff|added|removed/i, 3000),
      "major",
      "confusing",
      "The audit log does not show the staff changes I just made, so it cannot be used to answer a question about access.",
    );

    // The other half of the DPO's question: getting data OUT.
    const exportish = page.getByRole("link", { name: /export|download|copy of/i }).first();
    t.expects(
      await t.sees(exportish, 1500),
      "major",
      "stuck",
      "There is nothing here that gets our data out — no export for a subject-access request, and nothing to take with us if we ever leave.",
    );
  });
});

test("what an admin can see about email, and about money", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.admin);

  // Email is how every family gets in. When it stops, the school finds out from
  // angry parents.
  await carryOn(async () => {
    await t.open("/admin", "the whole-school console");
    const mailish = page.getByRole("button", { name: /email|mail|delivery|messages/i }).first();
    t.expects(
      await t.sees(mailish, 1500),
      "major",
      "stuck",
      "I cannot see anything about email from here. If sign-in letters to families are bouncing, I have no way of knowing — and I am the person parents will ring.",
    );
  });

  // Money: what are we on, what does it cost, when does it renew.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/billing", "our plan and billing");
    const answered = await t.seesText(/\bplan\b|£|renew|invoice|per year|trial/i, 3000);
    t.expects(
      answered,
      "major",
      "confusing",
      "I cannot tell what we are paying, or when it renews, from the billing page.",
    );

    t.expects(
      await t.seesText(/invoice|purchase order|\bPO\b/i, 2000),
      "minor",
      "stuck",
      "There is no way to pay by invoice or purchase order. No maintained school can put a subscription on a card without a fight with the finance office.",
    );

    // The renewal question every business manager asks before signing.
    t.expects(
      await t.seesText(/cancel|\bstop\b|leave|what happens if/i, 2000),
      "minor",
      "confusing",
      "Nothing says what happens to the children's work if we stop paying. That is the first question our data protection lead asks.",
    );
  });
});

test("take a family's access away, and take a class away", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.admin);

  // A family code on a letter that went to the wrong address, or a parent who
  // no longer has parental responsibility: a safeguarding job, on a clock.
  await carryOn(async () => {
    await t.open("/teacher", "my classes and children");
    const child = page.getByRole("link", { name: new RegExp(`\\b${ACADEMY.parents.removable.children[0]}\\b`) }).first();
    if (!(await t.sees(child, 3000))) {
      // This may well be the product working: SAFEGUARDING rule 5 says admins
      // are not all-seeing, and an admin who teaches no class has no business
      // browsing children. What is NOT working is being shown an empty screen
      // and left to work that out.
      const explained = await t.seesText(/only see|do not teach|class teacher|not shown|your classes/i, 2000);
      t.say(
        explained ? "minor" : "major",
        "confusing",
        explained
          ? "I cannot reach an individual child, which the screen does explain — but it stops there, and a family-access problem is on a clock. It should tell me who at the school can do it."
          : "As the account holder I get an empty screen with no children on it and no explanation. I cannot tell whether I am not allowed, whether something is broken, or who to ask — and a safeguarding request about family access is on a clock.",
      );
      return;
    }
    await t.act("open the child's page", async () => child.click());
    await t.sweep("a child's page, as the admin");

    const family = page.getByRole("button", { name: /family|grown-?up|parent|code/i }).first();
    if (!(await t.sees(family, 2000))) {
      t.say("major", "stuck", "I cannot find who has family access to this child, or how to take it away.");
      return;
    }
    await t.act("look at who has access", async () => family.click());
    await t.sweep("the family access panel");

    const revoke = page.getByRole("button", { name: /remove|revoke|take away|stop/i }).first();
    t.expects(
      await t.sees(revoke, 2000),
      "major",
      "stuck",
      "I can see who has access to this child's work but not how to remove it. On a safeguarding matter that is the only button that matters.",
    );

    t.expects(
      await t.seesText(/rotate|new code|change the code/i, 2000),
      "minor",
      "confusing",
      "If a family code has gone to the wrong house, nothing here offers me a new one, so the old letter keeps working.",
    );
  });

  // Closing the account altogether: the question a school's data protection
  // lead asks before signing, and the one a school asks when it leaves.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/account", "our account");
    const close = page.getByRole("button", { name: /close (the )?account|delete (our|the) (account|school)|leave storyjar/i }).first();
    const closeLink = page.getByRole("link", { name: /close (the )?account|delete (our|the) (account|school)|leave/i }).first();
    t.expects(
      (await t.sees(close, 1500)) || (await t.sees(closeLink, 1500)),
      "major",
      "stuck",
      "There is no way for me to close our account and have the children's data deleted. Our retention policy says we can ask for it — and the only route I can see is emailing somebody and hoping.",
    );
    t.expects(
      await t.seesText(/deleted after|retention|how long|kept for/i, 2000),
      "minor",
      "confusing",
      "Nothing on the account page says how long our children's work is kept, or what happens to it if we stop. Our DPO asks that in writing every year.",
    );
  });

  // Deleting a class: the most destructive thing in the product.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/class", "our classes");
    const klass = page.getByRole("button", { name: new RegExp(ACADEMY.classes.deletable.name.replace(/[()]/g, "\\$&"), "i") }).first();
    if (!(await t.sees(klass, 3000))) {
      t.say("minor", "confusing", "I could not find the old class I wanted to delete.");
      return;
    }
    await t.act("open the old class", async () => klass.click());
    const settings = page.getByRole("button", { name: /class settings|settings/i }).first();
    if (!(await t.sees(settings, 2000))) {
      t.say("major", "stuck", "There is no way to close down a class that is no longer taught.");
      return;
    }
    await t.act("open its settings", async () => settings.click());
    await t.sweep("class settings");

    const del = page.getByRole("button", { name: /delete this class/i }).first();
    if (!(await t.sees(del, 2000))) {
      t.say("major", "stuck", "I cannot delete a class that has finished, so old rosters and codes stay live for ever.");
      return;
    }
    await t.act("start deleting it", async () => del.click());
    await t.sweep("the delete-class dialog");

    // The friction is the feature. This is children's work.
    t.expects(
      await t.seesText(/permanent|cannot be undone/i, 2000),
      "major",
      "fragile",
      "Deleting a class does not say, in words, that it is permanent and takes every child's work with it.",
    );
    t.expects(
      await t.seesText(/type the class name|confirm/i, 2000),
      "major",
      "fragile",
      "Deleting a class needs no deliberate confirmation, so a mis-tap destroys a year of children's work.",
    );

    // Leave without deleting: the escape hatch has to work too.
    const cancel = page.getByRole("button", { name: /cancel|close|back/i }).first();
    t.expects(
      await t.sees(cancel, 1500),
      "major",
      "stuck",
      "Having opened the delete dialog by accident, I cannot see how to get out of it without going through with it.",
    );
    if (await t.sees(cancel, 1000)) await t.act("back out of it", async () => cancel.click());
  });
});
