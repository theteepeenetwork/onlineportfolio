import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { SCHOOL_C } from "../helpers";
import { signIn } from "./actions";

// ===========================================================================
// Mrs Frost's trial ended and nobody noticed.
//
// A lapsed account is the least-designed state in most products and the one
// most likely to be met by a real person having a bad day: she has children's
// work in there, a governor asking for it, and buttons that no longer do
// anything. The product has to tell her, in words, what has happened, what she
// can still do, and how to fix it — without her ringing anyone.
//
// This is the one journey that uses an existing fixture school (School C,
// Larchwood) rather than the tester team's own, because a genuinely frozen
// account already exists there and freezing Bramblewood would break every other
// persona.
// ===========================================================================

test.use({ persona: TEAM.frozenAdmin });

test("a lapsed account: what am I allowed to do, and how do I fix it?", async ({ page, tester: t }) => {
  await signIn(t, page, SCHOOL_C.teacher);

  await carryOn(async () => {
    // Does anything say what has happened, before she discovers it by failing?
    const told = await t.seesText(/read.?only|lapsed|expired|frozen|ended|payment/i, 3000);
    t.expects(
      told,
      "major",
      "confusing",
      "Nothing on my home page says the account has lapsed. I find out by pressing something and having it not work.",
    );

    t.expects(
      await t.seesText(/still|can (still )?(see|view|download)|kept|safe|not deleted/i, 2500),
      "major",
      "confusing",
      "Nobody has told me whether the children's work is still there. That is my first question and my governors' first question.",
    );

    const fix = page.getByRole("link", { name: /pay|renew|plan|billing|subscribe/i }).first();
    const fixButton = page.getByRole("button", { name: /pay|renew|plan|billing|subscribe/i }).first();
    t.expects(
      (await t.sees(fix, 1500)) || (await t.sees(fixButton, 1500)),
      "major",
      "stuck",
      "There is no obvious way to put the account right from the message telling me it is wrong.",
    );
  });

  // Try to do the job anyway. Refusals must be sentences, not silence.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/queue", "the approval queue on a lapsed account");
    const approve = page.getByRole("button", { name: /add to jar/i }).first();
    if (await t.sees(approve, 2500)) {
      await t.act("try to approve a piece of work", async () => approve.click());
      t.expects(
        await t.seesText(/read.?only|cannot|lapsed|renew|payment/i, 3000),
        "major",
        "confusing",
        "I pressed approve on a lapsed account and nothing said why it did not work. A button that is offered and then silently refuses is worse than one that is not there.",
      );
    }
  });

  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/class", "my classes on a lapsed account");
    // The one thing that must never be blocked by money: getting the children's
    // work back out, and taking access away from somebody who should not have it.
    t.expects(
      await t.seesText(/export|download|copy/i, 2500),
      "major",
      "stuck",
      "I cannot get the children's work out of a lapsed account. Our data is being held behind a payment I am trying to make.",
    );
  });
});
