import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signIn } from "./actions";

// ===========================================================================
// The jobs a teacher does around the edges of teaching: the code has leaked,
// the class is younger than the product thinks, something is due on Friday, and
// somebody has to change a password.
//
// None of these is the core flow, which is exactly why they are worth walking:
// they are the screens a teacher meets once, under pressure, with no chance to
// learn them first.
// ===========================================================================

test.use({ persona: TEAM.busyTeacher });

test("the class code has gone round the whole village", async ({ page, tester: t }) => {
  // The remedy for a leaked code. A teacher does this with thirty children
  // waiting to sign in, so it has to be findable and it has to be obvious what
  // breaks when they do it.
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/class", "my classes");

  await carryOn(async () => {
    const klass = page.getByRole("button", { name: new RegExp(ACADEMY.classes.colleague.name, "i") }).first();
    const mine = page.getByRole("button", { name: new RegExp(ACADEMY.classes.eyfs.name, "i") }).first();
    const target = (await t.sees(mine, 2500)) ? mine : klass;
    await t.act("open the class", async () => target.click());
    await t.sweep("one class, open");

    const before = ((await page.locator('p:has-text("class code") strong').first().innerText().catch(() => "")) ?? "").trim();
    t.expects(
      /^[A-Z0-9]{4,8}$/.test(before),
      "major",
      "confusing",
      "I cannot see this class's sign-in code on its own page, so I cannot tell the children what to type.",
    );

    const settings = page.getByRole("button", { name: /class settings|settings/i }).first();
    if (await t.sees(settings, 2000)) await t.act("open class settings", async () => settings.click());

    const rotate = page.getByRole("button", { name: /new code|rotate|change the code/i }).first();
    if (!(await t.sees(rotate, 2000))) {
      t.say(
        "major",
        "stuck",
        "A parent has shared our class code round the village and there is nothing here to change it. My only option is to delete the class and start again.",
      );
      return;
    }

    await t.act("ask for a new code", async () => rotate.click());
    t.expects(
      await t.seesText(/old code|stop working|will not work|children will need/i, 2500),
      "major",
      "fragile",
      "Nothing warns me that changing the code stops the old one working, so any child mid-sign-in is locked out and I will not know why.",
    );
  });
});

test("this class is younger than Storyjar thinks", async ({ page, tester: t }) => {
  // The age mode decides which of three products a child sees. Getting it wrong
  // is quiet: nothing breaks, the children just get the wrong reading age.
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/class", "my classes");

  await carryOn(async () => {
    const klass = page.getByRole("button", { name: new RegExp(ACADEMY.classes.ks2.name, "i") }).first();
    if (!(await t.sees(klass, 2500))) return;
    await t.act("open the class", async () => klass.click());
    const settings = page.getByRole("button", { name: /class settings|settings/i }).first();
    if (await t.sees(settings, 2000)) await t.act("open class settings", async () => settings.click());
    await t.sweep("class settings");

    const switcher = page.getByRole("radio").or(page.getByRole("button", { name: /reception|nursery|year|EYFS|KS1|KS2|younger|older/i }));
    t.expects(
      await t.sees(switcher.first(), 2500),
      "major",
      "stuck",
      "I cannot change what my class sees. I picked the wrong one when I signed up and my Year 6s are being spoken to like Reception.",
    );

    t.expects(
      await t.seesText(/what (they|the children) see|reading|younger|older|\bjar\b|journal/i, 2000),
      "minor",
      "confusing",
      "The age setting does not tell me what actually changes for the children, so I am guessing which one my class needs.",
    );
  });
});

test("something is due on Friday", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/calendar", "my calendar");

  await carryOn(async () => {
    t.expects(
      await t.seesText(new RegExp(`${ACADEMY.activities.ks1}|${ACADEMY.activities.quiz}|${ACADEMY.activities.ks2}`, "i"), 3000),
      "major",
      "confusing",
      "The activities I have set are not on the calendar, so it does not tell me what my classes are meant to be doing this week.",
    );

    t.expects(
      await t.seesText(/\d+\s*\/\s*\d+|waiting|\bdone\b|to do/i, 2000),
      "minor",
      "confusing",
      "The calendar shows me what is set but not how far the children have got, so I still have to go and look somewhere else.",
    );

    // Can a teacher get from "this is due" to "here is who has not done it"?
    const anyLink = page.getByRole("link").filter({ hasText: new RegExp(ACADEMY.activities.ks1, "i") }).first();
    const anyButton = page.getByRole("button").filter({ hasText: new RegExp(ACADEMY.activities.ks1, "i") }).first();
    t.expects(
      (await t.sees(anyLink, 1500)) || (await t.sees(anyButton, 1500)),
      "minor",
      "stuck",
      "I can see an activity on the calendar and cannot open it from there.",
    );
  });
});

test("somebody has to change a password", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/account", "my account");

  await carryOn(async () => {
    t.expects(
      await t.seesText(/password/i, 2500),
      "major",
      "stuck",
      "I cannot change my password from my own account page.",
    );

    // A shared staffroom machine and a password change: does it say what happens
    // to the sessions already signed in elsewhere?
    t.expects(
      await t.seesText(/signed out|other devices|sessions|elsewhere/i, 2000),
      "minor",
      "confusing",
      "Changing my password says nothing about the tablet in the classroom that is still signed in as me.",
    );

    t.expects(
      await t.seesText(/\bplan\b|billing|trial|£/i, 2000),
      "minor",
      "confusing",
      "My account page does not tell me what our school is on, so I cannot answer the head when she asks.",
    );
  });
});
