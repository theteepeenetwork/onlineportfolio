import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signIn, signInChild, signOut } from "./actions";

// ===========================================================================
// Mr Reeves sets work, a child does it, and he marks it.
//
// This is the product's spine and the journey nobody tests end to end, because
// each half is convenient to test alone. Both halves are here, in one session,
// in the order a school day puts them: author → assign → the child's turn →
// mark → feed back → the child's second go.
//
// He is doing it mid-lesson, on an iPad, standing up.
// ===========================================================================

test.use({ persona: TEAM.busyTeacher });

test("set a quiz, watch a child take it, and mark it", async ({ page, tester: t }) => {
  const title = `Autumn quiz ${Date.now().toString().slice(-5)}`;

  await signIn(t, page, ACADEMY.teacher);

  // --- Author it ---------------------------------------------------------
  await t.open("/teacher/activities", "my activity library");
  const newActivity = page.getByRole("link", { name: /new (activity|template)/i }).first();
  if (await t.sees(newActivity)) {
    await t.act("start a new activity", async () => newActivity.click());
  } else {
    t.say(
      "minor",
      "confusing",
      "I could not find “new activity” on the library page and had to know the address by heart.",
    );
    await t.open("/teacher/activities/new", "the new-activity page");
  }
  await t.sweep("the new-activity page");

  await carryOn(async () => {
    await t.act("give it a title and instructions", async () => {
      await page.fill("#title", title);
      await page.fill("#instructions", "Tap the answer you think is right.");
    });

    await t.act("open the builder", async () => {
      await page.getByRole("button", { name: /build a template or quiz/i }).click();
    });
    await t.sweep("the activity builder");

    await t.act("add a quiz to the page", async () => {
      await page.locator('button[title="Add"]').click();
      await page.getByRole("button", { name: "Quiz", exact: true }).click();
    });

    const panel = page.getByRole("region", { name: "Quiz builder" });
    await t.act("write a question with two answers", async () => {
      await panel.getByRole("button", { name: /add question to page 1/i }).click();
      await panel.getByPlaceholder("What do you want to ask?").fill("Which season comes after summer?");
      await panel.getByPlaceholder("Type an answer").nth(0).fill("Autumn");
      await panel.getByPlaceholder("Type an answer").nth(1).fill("Spring");
    });

    // The half a teacher gets wrong in a hurry: marking which answer is right.
    // If the default is silently "the first one", a mis-set quiz marks a whole
    // class wrong and nobody finds out.
    const markCorrect = panel.getByRole("button", { name: /mark .* as correct/i }).first();
    const canMark = await t.sees(markCorrect);
    t.expects(
      canMark,
      "major",
      "confusing",
      "I could not see how to say WHICH answer is the right one. If it silently defaults to the first, a whole class gets marked against an answer I never chose.",
    );
    if (canMark) await t.act("mark the right answer", async () => markCorrect.click());

    await t.act("finish the builder", async () => {
      await page.locator('button[title="Done"]').click();
    });
    // Does it tell me what I have made, before I commit it?
    t.expects(
      await t.seesText(/quiz question/i),
      "minor",
      "confusing",
      "Nothing on the page confirmed how many quiz questions the activity now has, so I am saving on trust.",
    );

    await t.act("save it to my library", async () => {
      await page.getByRole("button", { name: /save to library/i }).click();
      await page.getByRole("heading", { name: title }).waitFor({ state: "visible" });
    });
    await t.sweep("the activity I just made");
    t.budget(12, "Making a quiz from scratch");
  });

  // --- Assign it ---------------------------------------------------------
  await carryOn(async () => {
    t.newJob();
    await t.act("assign it", async () => {
      await page.getByRole("button", { name: /assign/i }).first().click();
    });
    await t.sweep("the assign panel");

    // Mr Reeves has four classes, from Reception to Year 6. Which one is this
    // panel about to set Year 6 work for?
    const target = page.getByRole("button", { name: new RegExp(`^(✓ )?${ACADEMY.classes.ks1.name}$`, "i") }).first();
    const canChoose = await t.sees(target);
    t.expects(
      canChoose,
      "major",
      "confusing",
      "The assign panel does not let me choose which of my four classes this is for.",
    );

    // Which one is pre-selected? A panel that opens on a class and has a
    // one-tap "assign to whole class" underneath it will, sooner or later, set
    // Year 6 work for Reception.
    const preselected = (await page.getByRole("button", { name: /^✓ / }).first().innerText().catch(() => "")).replace(/^✓\s*/, "").trim();
    t.expects(
      preselected === "" || new RegExp(ACADEMY.classes.ks1.name, "i").test(preselected),
      "major",
      "fragile",
      `The panel opened with “${preselected}” already chosen — not the class I was looking at — and “Assign to whole class” is one tap below it. Setting Year 6 work for Reception is a single mis-tap, and nothing afterwards says which class got it.`,
    );

    if (canChoose) {
      await t.act(`choose ${ACADEMY.classes.ks1.name}`, async () => target.click());
    }

    await t.act("set it for the whole class", async () => {
      await page.getByRole("button", { name: /assign to whole class/i }).click();
      await page.waitForURL((url) => url.searchParams.has("run"));
    });

    // Having assigned it, does the screen tell me which class now has it?
    t.expects(
      await t.seesText(new RegExp(ACADEMY.classes.ks1.name, "i"), 2000),
      "major",
      "confusing",
      "After assigning, nothing on screen names the class that got the work, so a mis-tap in the panel is invisible until a child asks why they have Year 6 maths.",
    );
    await t.sweep("the activity with a live run on it");
    t.budget(4, "Assigning an activity to a class");
  });

  // --- The child's turn --------------------------------------------------
  // Same browser, same lesson: he hands the iPad to the child.
  await carryOn(async () => {
    await signOut(page);
    t.newJob();
    t.setScreen("(handing the iPad to a child)");
    await signInChild(t, page, ACADEMY.classes.ks1.code, ACADEMY.waiting.child);

    await t.open("/student/activities", "my activities");
    const todo = page.getByRole("link", { name: new RegExp(title, "i") });
    const found = await t.sees(todo);
    t.expects(
      found,
      "blocker",
      "stuck",
      "The activity my teacher just set is not in my list, so I cannot do it.",
      `looking for “${title}”`,
    );
    if (!found) return;

    await t.act("open the activity my teacher set", async () => todo.click());
    await page.waitForTimeout(1200); // the canvas and its background load
    await t.sweep("the activity, open");

    const answer = page.getByRole("button", { name: "Autumn" });
    const answerable = await t.sees(answer, 8000);
    t.expects(
      answerable,
      "blocker",
      "stuck",
      "I cannot find the answers to tap. The question is there but the answers are not something I can press.",
    );
    if (answerable) {
      const box = await answer.boundingBox();
      if (box) {
        t.expects(
          box.height >= 64 && box.width >= 64,
          "major",
          "unreadable",
          `The answer button is ${Math.round(box.width)}×${Math.round(box.height)}px — smaller than a six-year-old's finger reliably hits (SAFEGUARDING rule 18 asks 64px).`,
        );
      }
      await t.act("tap my answer", async () => answer.click());
      t.expects(
        !(await t.seesText(/correct|well done|wrong|try again/i, 1200)),
        "major",
        "confusing",
        "It told me whether I was right. A quiz that marks itself in front of the child turns a formative activity into a test, and the teacher never sees the child's real first answer.",
      );
    }

    await t.act("hand it in", async () => {
      await page.locator('button[title="Done"]').click();
      await page.getByRole("button", { name: /hand it in/i }).click();
      await page.waitForURL((url) => url.pathname === "/student/popped");
    });
    await t.sweep("the celebration screen");
    t.budget(6, "A child doing an activity their teacher set");
  });

  // --- Marking it --------------------------------------------------------
  await carryOn(async () => {
    await signOut(page);
    t.newJob();
    await signIn(t, page, ACADEMY.teacher);
    await t.open("/teacher/queue", "the approval queue");

    const row = page.locator(`[data-child="${ACADEMY.waiting.child}"]`).first();
    const waiting = await t.sees(row);
    t.expects(
      waiting,
      "blocker",
      "stuck",
      "The work the child just handed in is not in my queue, so I cannot mark it.",
    );
    if (!waiting) return;

    // The score. A teacher marking thirty of these needs it without opening
    // anything.
    const score = page.getByRole("button", { name: /quiz \d+\/\d+/i }).first();
    t.expects(
      await t.sees(score),
      "major",
      "confusing",
      "The queue does not show me how the child did on the quiz. I have to open each piece one at a time to find out.",
    );
    if (await t.sees(score)) {
      await t.act("look at their answers", async () => score.click());
      t.expects(
        await t.seesText(/which season comes after summer/i),
        "minor",
        "confusing",
        "Opening the quiz review does not show the question I actually asked, so I cannot tell what they got wrong.",
      );
    }

    // Send it back with feedback — the half of assessment that makes it worth
    // doing, and the one thing a teacher does that a child then has to act on.
    await t.act("send it back with a note", async () => {
      await row.getByRole("button", { name: /send back/i }).click();
      await page
        .getByPlaceholder(/a kind note/i)
        .fill("Nearly! Look again at the second answer and tell me why you picked it.");
      await page.getByRole("button", { name: /^send back$/i }).click();
    });

    t.budget(6, "Marking a piece of work and sending it back with feedback");
  });

  // --- The child's second go ---------------------------------------------
  await carryOn(async () => {
    await signOut(page);
    t.newJob();
    await signInChild(t, page, ACADEMY.classes.ks1.code, ACADEMY.waiting.child);

    const toldSomething = await t.seesText(/again|look|back|nearly|teacher/i, 4000);
    t.expects(
      toldSomething,
      "major",
      "confusing",
      "My teacher sent my work back with a note and nothing on my jar tells me. I have no way of knowing there is anything to do.",
    );

    const note = await t.seesText(/look again at the second answer/i, 4000);
    t.expects(
      note,
      "major",
      "confusing",
      "I cannot find what my teacher actually said. Feedback a child never reads is feedback that did not happen.",
    );
  });
});

test("edit an activity that a class is already working on", async ({ page, tester: t }) => {
  // The mistake every teacher makes: a typo spotted after the class has started.
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/activities", "my activity library");

  await carryOn(async () => {
    const existing = page.getByRole("link", { name: new RegExp(ACADEMY.activities.ks1, "i") }).first();
    if (!(await t.sees(existing))) {
      t.say("major", "stuck", "I cannot find the activity I set last week in my library.");
      return;
    }
    await t.act("open the activity my class is doing", async () => {
      await existing.click();
      // Wait for the activity's own page, not just for the click to land: the
      // library and the activity both live under /teacher/activities, so the URL
      // alone cannot tell you which one you are looking at.
      await page.getByRole("heading", { name: new RegExp(ACADEMY.activities.ks1, "i") }).waitFor({ state: "visible" });
    });
    await t.sweep("an activity with a live run");

    const more = page.getByRole("button", { name: /more actions/i }).first();
    if (!(await t.sees(more))) {
      t.say("major", "stuck", "There is no way to edit this activity from its own page.");
      return;
    }
    await t.act("open its menu", async () => more.click());

    const edit = page.getByRole("menuitem", { name: /edit/i }).first();
    if (!(await t.sees(edit, 3000))) {
      t.say("major", "stuck", "The activity's own menu offers me no way to edit it.");
      return;
    }
    await t.act("choose edit", async () => {
      await edit.click();
      await page.waitForURL((url) => /\/edit$/.test(url.pathname));
    });
    await t.sweep("the activity editor");

    // The question a teacher actually has, and the one the screen must answer:
    // does fixing this change what the children in front of me are looking at?
    t.expects(
      await t.seesText(/live|already|class(es)? (are|is) working|will (also )?(change|update)/i, 1500),
      "major",
      "confusing",
      "Nothing here tells me whether editing this changes the version the class is working on RIGHT NOW, or only future ones. That is the only thing I need to know before I touch it.",
    );

    await t.act("fix the wording", async () => {
      await page.fill("#instructions", "Draw one minibeast you found, and label how many legs it has.");
      await page.getByRole("button", { name: /save changes/i }).click();
    });
    t.budget(8, "Fixing a typo in an activity a class is mid-way through");
  });
});
