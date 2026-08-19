import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signIn } from "./actions";

// ===========================================================================
// Sam is the teaching assistant, and usually the adult holding the tablet.
//
// The TA role is the least-exercised permission set in the product and the one
// most likely to be used by somebody who was handed a login and no training.
// What they can do matters; what they are stopped from doing matters more, and
// being stopped has to be legible — a control that is offered and then silently
// refuses is worse than one that was never there.
// ===========================================================================

test.use({ persona: TEAM.assistant });

test("what am I allowed to do here?", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.ta);

  await carryOn(async () => {
    // First question on a shared device: whose account am I in?
    t.expects(
      await t.seesText(/sam/i, 3000),
      "minor",
      "confusing",
      "Nothing on screen tells me whose account I am signed in to. On a shared classroom iPad that is the first thing I need to know.",
    );

    // Second: what is this role allowed to do? A TA can be looking at children's
    // photographs, and nobody has told them the rules.
    t.expects(
      await t.seesText(/assistant|your role|you can|can(not| ?not) /i, 2500),
      "minor",
      "confusing",
      "Nothing says what a teaching assistant is allowed to do. I found out by pressing things, which is exactly how somebody publishes the wrong thing.",
    );
  });

  // The queue: can a TA approve children's work? Either answer is defensible.
  // Being unable to tell which is not.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/queue", "the approval queue");
    const approve = page.getByRole("button", { name: /add to jar/i }).first();
    const canApprove = await t.sees(approve, 2500);
    const saysWhyNot = await t.seesText(/only (a )?teacher|not allowed|ask|cannot approve/i, 1500);
    t.expects(
      canApprove || saysWhyNot,
      "major",
      "confusing",
      "The approval queue shows me children's work but neither lets me act on it nor says why not. I cannot tell whether it is broken or whether I am not allowed.",
    );
  });

  // The boundary that matters: another teacher's class.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/class", "the classes I can see");
    const mine = await t.seesText(new RegExp(ACADEMY.classes.ks1.name, "i"), 2500);
    const colleagues = await t.seesText(new RegExp(ACADEMY.classes.colleague.name, "i"), 1500);
    t.expects(
      mine || colleagues,
      "minor",
      "confusing",
      "I cannot see any classes at all, and nothing tells me I need to be added to one.",
    );
    if (colleagues && !mine) {
      t.say(
        "major",
        "fragile",
        "I can see a class I do not support, and not the one I do. A teaching assistant should be looking at the children they work with.",
      );
    }
  });

  // Destructive controls should not be within reach of a role that cannot undo
  // them. This is a question about the SCREEN, not about the server — the server
  // is covered by the security gate.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/class", "the classes I can see");
    const settings = page.getByRole("button", { name: /class settings/i }).first();
    if (await t.sees(settings, 2000)) {
      await t.act("open class settings", async () => settings.click());
      await t.sweep("class settings as a teaching assistant");
      const del = page.getByRole("button", { name: /delete this class/i }).first();
      t.expects(
        !(await t.sees(del, 1500)),
        "major",
        "fragile",
        "As a teaching assistant I am one screen from the button that permanently deletes a class and every child's work in it.",
      );
    }
  });

  await carryOn(async () => {
    t.newJob();
    await t.open("/admin", "the whole-school console");
    const reachable = !(await t.seesText(/not found|404/i, 1500));
    if (reachable) {
      t.expects(
        !(await t.sees(page.getByRole("button", { name: /invite staff|actions for/i }).first(), 1500)),
        "major",
        "fragile",
        "I can reach the staff console and the controls that add and remove people's access to children's work. That is not my job and I was not told it was possible.",
      );
    }
  });
});
