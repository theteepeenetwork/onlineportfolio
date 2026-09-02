import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { signIn, signOut } from "./actions";

// ===========================================================================
// Ms Blake signed up on her own in September. In January her school buys
// StoryJar, and Mrs Hartley asks her to join it.
//
// WHY THIS JOURNEY EXISTS AT ALL. The acceptance screen is the only place in
// the product where a data-controller change is explained to the person it
// happens to (docs/dpo-decisions.md, 2 September 2026), and its copy IS the
// safeguarding argument rather than a description of it. Every other test of
// that screen asks whether the right rows moved. This one asks the only
// question that matters about words: could a teacher read them and know what
// she was agreeing to?
//
// SHE SIGNS UP FOR REAL, rather than being seeded. The whole point is a teacher
// who already has a class and children of her own before anybody asks her
// anything — that is what makes the sentence "your classes become the school's"
// mean something, and there is no fixture for it in the tester team's school.
// Her address is at bramblewood.test so that prisma/seed-personas.ts removes
// her at the start of the next run: this journey permanently adds a member of
// staff to the school every other admin journey reads.
//
// IT DRIVES TWO PEOPLE, which is unusual here and unavoidable: an invitation
// cannot exist without an admin making one, and making one by writing a row
// directly would skip the half of the flow where a business manager types a
// colleague's address into a form.
// ===========================================================================

test.use({ persona: TEAM.newTeacher });

const HEAD = { email: "head@bramblewood.test", password: "password" };

test("a teacher with her own class is asked to join a school, and has to decide", async ({ page, tester: t }) => {
  const stamp = Date.now().toString().slice(-6);
  const email = `blake.${stamp}@bramblewood.test`;
  const password = "bramble-fox-lantern-9";
  let classCode = "";

  // --- She sets herself up, on her own, the way she did in September --------
  await carryOn(async () => {
    await t.open("/signup/teacher", "the sign-up page");
    await t.act("fill in who I am", async () => {
      await page.locator("#su-fullname").fill("Ali Blake");
      await page.locator("#su-email").fill(email);
      await page.locator("#su-pass").fill(password);
      await page.getByRole("button", { name: /^continue$/i }).click();
    });
    await t.act("name my school", async () => {
      await page.locator("#su-school").fill("Bramblewood Primary");
      await page.getByRole("button", { name: /^continue$/i }).click();
    });
    await t.act("name my class", async () => {
      await page.locator("#su-class").fill("Kingfishers");
      const modes = page.locator('input[name="su-agemode"]');
      if ((await modes.count()) > 0) await modes.first().check();
      await page.getByRole("button", { name: /create class/i }).click();
    });
    await t.act("paste my register", async () => {
      await page.locator("#su-children").fill("Ada\nBenji\nChidi");
      await page.getByRole("button", { name: /add pupils/i }).click();
      await page.waitForURL((url) => !/\/signup\/teacher$/.test(url.pathname), { timeout: 30000 });
    });

    // The code on the board. She checks it again at the end, because the
    // acceptance screen promises it will not change.
    await t.open("/teacher/class", "my classes");
    const shown = await page.locator("body").innerText();
    classCode = (shown.match(/\b[A-Z]{3}[A-Z0-9]{3}\b/) ?? [""])[0];
  });

  // --- Mrs Hartley asks her ------------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await signOut(page);
    await signIn(t, page, HEAD);
    await t.open("/admin", "the school's admin page");
    await t.act("open the invite form", async () => {
      await page.getByRole("button", { name: /invite staff/i }).click();
    });
    await t.act("invite Ali by her school address", async () => {
      await page.locator("#inv-name").fill("Ali Blake");
      await page.locator("#inv-email").fill(email);
      await page.getByRole("button", { name: /send invite/i }).click();
      await page.waitForTimeout(1200);
    });

    // The business manager must not be able to tell, from what she gets back,
    // whether that address already had a StoryJar account. This is the
    // account-existence oracle the four-case branch exists to remove, and the
    // person best placed to notice it is the one filling the form in.
    const toldSheHasAnAccount = await t.seesText(/already on StoryJar|already has an account/i, 1500);
    t.expects(
      !toldSheHasAnAccount,
      "major",
      "confusing",
      "When I invited a colleague who already uses Storyjar, the form told me she already had an account. I did not know that about her before I typed her address in.",
    );
    await t.sweep("the staff list after inviting somebody");
  });

  // --- She signs in and finds out ------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await signOut(page);
    await signIn(t, page, { email, password });

    const told = await t.seesText(/has asked you to join/i, 4000);
    t.expects(
      told,
      "major",
      "confusing",
      "My school has asked me to join its Storyjar account and there is nothing on my screen to tell me so. I would only find out if somebody said it to me in the staffroom.",
    );

    if (told) {
      await t.act("follow it up", async () => {
        await page.getByRole("link", { name: /what joining would mean/i }).first().click();
        await page.waitForURL(/\/teacher\/account\/invitation\//);
      });
    } else {
      await t.open("/teacher/account", "my account page");
      const card = page.getByRole("link", { name: /what joining/i }).first();
      if (await t.sees(card, 2000)) await t.act("follow it up from my account page", async () => card.click());
    }
    await t.sweep("the screen that explains what joining would mean");
  });

  // --- Does it actually say what happens? ----------------------------------
  //
  // Five things, each read separately, because a screen that says four of them
  // is not "mostly right": the missing one is the thing she finds out
  // afterwards, and one of them cannot be undone.
  await carryOn(async () => {
    t.newJob();

    t.expects(
      await t.seesText(/Kingfishers/, 3000),
      "major",
      "confusing",
      "It talks about “your classes” without saying which ones. I have to take its word for what it is about to move.",
    );

    t.expects(
      await t.seesText(/responsible for the children|become(s)? the school|school is responsible/i, 2000),
      "blocker",
      "confusing",
      "I am being asked to hand my class over to the school and the screen does not say that is what is happening. I could press this without knowing.",
    );

    t.expects(
      await t.seesText(/stay with|cannot take them|do not travel/i, 2000),
      "major",
      "confusing",
      "It does not tell me what happens if I move schools. I would assume my children's work came with me, because it is my account.",
    );

    t.expects(
      await t.seesText(/would not see|unless they teach/i, 2000),
      "major",
      "confusing",
      "It does not say what the office can see. I would want to know before the head can look at my class.",
    );

    t.expects(
      await t.seesText(/charged to you|free teacher plan ends/i, 2000),
      "major",
      "confusing",
      "It does not say what happens to my plan or whether this costs me anything.",
    );

    t.expects(
      await t.seesText(/class codes stay the same|carry on teaching/i, 2000),
      "minor",
      "confusing",
      "It tells me everything that changes and nothing that does not. I cannot tell whether I have to give my class a new code on Monday.",
    );

    // The decision itself. Both buttons must be there and neither should be
    // shouting: this is an adult deciding about children's data, and a screen
    // that steers her is a screen that decided for her.
    const join = page.getByRole("button", { name: /^Join /i });
    const decline = page.getByRole("button", { name: /no thank you/i });
    t.expects(
      (await t.sees(join, 2000)) && (await t.sees(decline, 2000)),
      "blocker",
      "stuck",
      "I have read all this and there is no way to say yes or no on the screen.",
    );
    t.budget(4, "Finding out what joining my school would mean");
  });

  // --- She says yes --------------------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await t.act("join the school", async () => {
      await page.getByRole("button", { name: /^Join /i }).click();
      // THE EXACT PATHNAME, not a pattern. `/\/teacher\/account/` also matches
      // the invitation screen this button is on, so it returned instantly and
      // everything below ran against the page she had just left — which is how
      // the first version of this journey "passed" the "did it tell me it
      // worked?" check on the screen that had not answered yet.
      await page.waitForURL((url) => url.pathname === "/teacher/account", { timeout: 20000 });
    });
    await t.sweep("my account page after joining");

    t.expects(
      // The whole sentence, not an alternation. "the school" on its own is on
      // half the screens in this product, so a looser pattern would have
      // answered "did it tell me?" with "there are words about a school here".
      await t.seesText(/you have joined the school/i, 3000),
      "major",
      "confusing",
      "I pressed join and the page came back looking much the same. I cannot tell whether it worked.",
    );

    // The promise the screen made, checked the only way that counts: is her
    // class still there, and is the code on the board still the code on the
    // board?
    await t.open("/teacher/class", "my classes, after joining");
    t.expects(
      await t.seesText(/Kingfishers/, 3000),
      "blocker",
      "stuck",
      "I joined the school and my class is not on my screen any more.",
    );
    if (classCode) {
      // LOOKED FOR, NOT SNAPSHOTTED. The first version of this read
      // `body.innerText()` once, the instant the class name appeared, and
      // reported a blocker — "my class code changed" — against a product where
      // the row in the database was byte-for-byte the same before and after.
      // A tester waits a moment for a page to settle; a single synchronous read
      // does not, and a false blocker on the one promise this screen makes
      // about the children is exactly the kind that gets a whole report muted.
      t.expects(
        await t.seesText(new RegExp(classCode), 3000),
        "blocker",
        "broke",
        "My class code changed when I joined the school. It is written on the board and my children cannot get in with it.",
        `code was ${classCode}`,
      );
    }
  });
});
