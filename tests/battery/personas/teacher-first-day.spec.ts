import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { signOut } from "./actions";

// ===========================================================================
// Ms Blake has twenty minutes before the bell and has never seen this before.
//
// The only journey in the battery that starts with no account at all, and the
// one that decides whether a school ever becomes a customer: find the way in,
// get through the wizard, get the children in, and check that the code on the
// board actually lets them sign in.
//
// Everything she creates is her own school. She is not borrowing the tester
// team's — a new starter's first five minutes is a different product from the
// one everybody else in this suite uses, and the whole point is to see it.
// ===========================================================================

test.use({ persona: TEAM.newTeacher });

test("from the landing page to a class of children who can sign in", async ({ page, tester: t }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `blake.${stamp}@newschool.test`;

  await t.open("/", "the Storyjar home page");

  // --- Can she tell what it is, and find the way in? ----------------------
  await carryOn(async () => {
    t.expects(
      await t.seesText(/journal|portfolio|class|children|pupils/i, 2000),
      "major",
      "confusing",
      "I cannot tell from the first screen what this actually does.",
    );

    const start = page.getByRole("link", { name: /start|sign up|try|free|get started|create/i }).first();
    if (await t.sees(start, 2000)) {
      await t.act("follow the way in", async () => start.click());
      await page.waitForTimeout(800);
    }

    const arrived = /signup/.test(new URL(page.url()).pathname);
    t.expects(
      arrived,
      "major",
      "confusing",
      "The button I took to be “start here” did not take me anywhere I could sign up from, so I went looking for the address.",
      `landed on ${new URL(page.url()).pathname}`,
    );
    if (!arrived) await t.open("/signup/teacher", "the sign-up page");
    await t.sweep("the first step of signing up");
    t.budget(3, "Finding where to sign up");
  });

  // --- The wizard ----------------------------------------------------------
  await carryOn(async () => {
    t.newJob();

    // How long is this going to take? A wizard that does not say is a wizard a
    // busy teacher abandons at step two.
    t.expects(
      await t.seesText(/step \d of \d|takes about|two minutes/i, 1500),
      "minor",
      "confusing",
      "Nothing tells me how many steps this is or how long it takes before I start typing.",
    );

    await t.act("fill in who I am", async () => {
      await page.locator("#su-fullname").fill("Alex Blake");
      await page.locator("#su-email").fill(email);
      await page.locator("#su-pass").fill("bramble-fox-lantern-9");
    });

    // The promise a teacher needs before typing children's names in.
    t.expects(
      // "data" matched something on almost any page, so this had never failed.
      // A teacher about to type a class of children's names in needs a promise,
      // not the word "data" — so this asks for one being made.
      await t.seesText(
        /nothing is (kept|published|shared) until|only you (and|can)|never (sold|shared|used to)|your school (owns|controls)|approv(e|al)/i,
        1500,
      ),
      "major",
      "confusing",
      "Nothing on the way in says what happens to children's work or who can see it. I am about to type my class into this.",
    );

    await t.act("continue", async () => page.getByRole("button", { name: /^continue$/i }).click());
    await t.sweep("the school step");

    await t.act("name my school", async () => page.locator("#su-school").fill(`Newfield Primary ${stamp}`));
    await t.act("continue", async () => page.getByRole("button", { name: /^continue$/i }).click());
    await t.sweep("the class step");

    await t.act("name my class", async () => page.locator("#su-class").fill("Sparrows"));

    // Age mode: what the children will see. Nothing is pre-selected, which is
    // deliberate — so the screen has to make the choice make sense to somebody
    // who has never seen either version.
    const modes = page.locator('input[name="su-agemode"]');
    const modeCount = await modes.count();
    t.expects(
      modeCount > 0,
      "major",
      "confusing",
      "Nothing asks me how old my children are, so I cannot tell what version of this they will get.",
    );
    if (modeCount > 0) {
      t.expects(
        await t.seesText(/reception|\byear\b|3.5|5.7|7.11|younger|older|\bEYFS\b|KS1|KS2/i, 1500),
        "major",
        "confusing",
        "I am asked to choose what my children see, and the options are named in a way that does not tell me which one my Year 1 class needs.",
      );
      await t.act("choose the one for my year group", async () => modes.first().check());
    }

    await t.act("create the class", async () => page.getByRole("button", { name: /create class/i }).click());
    await t.sweep("the children step");

    await t.act("paste my register straight from the spreadsheet", async () => {
      await page.locator("#su-children").fill("Ali Hassan\nBea Turner\nCallum Reid\nDaisy Okon");
    });

    // First names only is a real safeguarding decision. Does she find out here,
    // or after typing thirty surnames?
    t.expects(
      await t.seesText(/first name/i, 1500),
      "minor",
      "confusing",
      "Nothing tells me whether to use surnames until after I have typed the whole register.",
    );

    await t.act("add my pupils", async () => {
      await page.getByRole("button", { name: /add pupils/i }).click();
      await page.waitForURL((url) => !/\/signup\/teacher$/.test(url.pathname), { timeout: 30000 });
    });
    await t.sweep("the end of signing up");
    t.budget(14, "Signing up and getting a class in");
  });

  // --- The first five minutes ---------------------------------------------
  let code = "";
  await carryOn(async () => {
    t.newJob();

    t.expects(
      await t.seesText(/\bcode\b|sign in|\bnext\b|start|children can/i, 3000),
      "major",
      "confusing",
      "I have finished setting up and nothing tells me what to do next, or how my children get in.",
    );

    // The one thing she needs before the bell: the code for the board.
    const shown = await page.locator("body").innerText();
    code = (shown.match(/\b[A-Z]{3}[A-Z0-9]{3}\b/) ?? [""])[0];
    if (!code) {
      await t.open("/teacher/class", "my classes");
      const openClass = page.getByRole("button", { name: /sparrows/i }).first();
      if (await t.sees(openClass, 3000)) await t.act("open my class", async () => openClass.click());
      code = ((await page.locator('p:has-text("class code") strong').first().innerText().catch(() => "")) ?? "").trim();
      t.say(
        "minor",
        "confusing",
        "The code my children type was not on the screen at the end of setting up. I had to go and find it.",
      );
    }
    t.expects(
      /^[A-Z0-9]{4,8}$/.test(code),
      "major",
      "stuck",
      "I cannot find the code my children type to sign in, so I do not know what to write on the board.",
      `read “${code}”`,
    );
  });

  // --- Does it work when a child types it? --------------------------------
  await carryOn(async () => {
    if (!/^[A-Z0-9]{4,8}$/.test(code)) return;
    t.newJob();
    await signOut(page);
    await t.open(`/login/student?code=${code}`, "what my children will see");

    t.expects(
      await t.sees(page.getByRole("button", { name: /Ali/ }), 4000),
      "blocker",
      "stuck",
      "I wrote the code on the board and my children cannot get in with it.",
      `code ${code}`,
    );

    // I pasted my register with surnames on it, the way it comes out of SIMS.
    // What is on the screen the whole class sees?
    const wall = await page.locator("body").innerText();
    const surnames = ["Hassan", "Turner", "Reid", "Okon"].filter((n) => wall.includes(n));
    t.expects(
      surnames.length === 0,
      "major",
      "fragile",
      `I pasted my register with surnames and Storyjar kept them: “${surnames.map((sn) => `… ${sn}`).join(", ")}” are on the sign-in screen the whole class sees. Adding the same list inside the app afterwards keeps first names only, so the rule exists — it just is not applied to the list I typed on my first day.`,
      `surnames on the name wall: ${surnames.join(", ") || "none"}`,
    );
  });
});
