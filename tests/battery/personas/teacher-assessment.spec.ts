import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signIn, signInChild } from "./actions";
import path from "node:path";

// ===========================================================================
// Mr Reeves, the morning after: thirty pieces of work waiting, ten minutes
// before the children come in.
//
// Assessment is where the product either saves a teacher time or costs it. The
// jobs here are the ones he does every single day: clear the queue, praise
// properly, send one back, tag work against skills for the evidence base, add a
// photo on behalf of a child who cannot, and check what a parent will see.
// ===========================================================================

test.use({ persona: TEAM.busyTeacher });

test("clear the approval queue before the bell", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/queue", "the approval queue");

  await carryOn(async () => {
    const anyWaiting = await t.sees(page.locator("[data-child]").first());
    if (!anyWaiting) {
      t.say("minor", "confusing", "My queue is empty, so I could not check the marking flow at all.");
      return;
    }

    // Can I tell, at a glance, whose work this is and what it belongs to?
    const row = page.locator(`[data-child="${ACADEMY.waiting.other}"]`).first();
    t.expects(
      await t.sees(row),
      "major",
      "confusing",
      `I cannot see ${ACADEMY.waiting.other}'s work in the queue even though it is waiting.`,
    );

    // Tagging against a skill IS the evidence base — the reason a school buys
    // this. If it is not on the same screen as approval, nobody does it.
    const skill = page.getByRole("button", { name: /number bonds|phonics|reasoning|motor|speaking/i }).first();
    const canTag = await t.sees(skill);
    t.expects(
      canTag,
      "major",
      "confusing",
      "I cannot tag this work against a skill from the queue, so building an evidence base means a second pass through every piece.",
    );
    if (canTag) await t.act("tag it against a skill", async () => skill.click());

    // Count first: a child can have more than one piece waiting, so "is the row
    // still there" proves nothing. What matters is that one fewer is waiting.
    const before = await page.locator("[data-child]").count();
    await t.act("add it to the child's jar", async () => {
      await row.getByRole("button", { name: /add to jar/i }).click();
    });
    await page.waitForTimeout(1200);
    const after = await page.locator("[data-child]").count();
    t.expects(
      after < before,
      "major",
      "confusing",
      "I approved a piece of work and the queue did not change, so I cannot tell whether the tap did anything. Working through thirty of these I will tap twice and never know.",
      `${before} waiting before, ${after} after`,
    );
    t.budget(5, "Approving one piece of work with a skill tag");
  });

  // Praise: the stickers screen. For a young child this is the whole payoff, and
  // for the teacher it is the bit most likely to be skipped if it is slow.
  await carryOn(async () => {
    t.newJob();
    await t.open("/teacher/queue", "the approval queue");
    const stickers = page.getByRole("link", { name: /sticker/i }).first();
    if (!(await t.sees(stickers))) {
      t.say("minor", "confusing", "I could not find the stickers/praise screen from the queue.");
      return;
    }
    await t.act("open the stickers screen", async () => stickers.click());
    await t.sweep("the stickers and praise screen");

    const note = page.getByRole("textbox").first();
    if (await t.sees(note)) {
      await t.act("write a kind note", async () => note.fill("You explained your thinking really clearly."));
    } else {
      t.say(
        "major",
        "confusing",
        "There is nowhere to write the child a note here — only stickers. A sticker without words is not feedback.",
      );
    }
    const publish = page.getByRole("button", { name: /add to jar|publish|save|send/i }).first();
    t.expects(
      await t.sees(publish),
      "major",
      "stuck",
      "Having chosen stickers and written a note, I cannot see how to actually send it to the child.",
    );
    if (await t.sees(publish)) await t.act("send it to the child", async () => publish.click());
    t.budget(6, "Adding stickers and a note to one piece of work");
  });
});

test("add a photo on a child's behalf, then check what the family will see", async ({ page, tester: t }) => {
  // Reception children cannot photograph their own model. The teacher does it —
  // and this path publishes straight away, with no approval step, which is the
  // one place a mistake reaches a family immediately.
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher", "my classes and children");

  await carryOn(async () => {
    const child = page.getByRole("link", { name: new RegExp(ACADEMY.classes.eyfs.children[1], "i") }).first();
    if (!(await t.sees(child))) {
      t.say("blocker", "stuck", "I cannot find a way into an individual child's journal from my home page.");
      return;
    }
    await t.act("open a child's journal", async () => child.click());
    await t.sweep("a child's journal");

    // Scoped to the page's own content, not the whole document: the top bar
    // carries "＋ New activity", which matched a loose /add|new/ first and took
    // this journey somewhere else entirely.
    const add = page.getByRole("main").getByRole("link", { name: /^＋?\s*add\b/i }).first();
    if (!(await t.sees(add))) {
      t.say("major", "stuck", "There is no way to add work for this child from their own page.");
      return;
    }
    await t.act("start adding work for them", async () => {
      await add.click();
      // Wait for the add-work screen itself. Clicking is not arriving: this is a
      // client-side navigation, and checking the next screen straight after the
      // click reports whatever the PREVIOUS one had — which is how this journey
      // once claimed there was nowhere to attach a photo, about a screen that
      // has an upload button on it.
      await page.getByText(/add to .*journal/i).first().waitFor({ state: "visible" });
    });
    await t.sweep("adding work on a child's behalf");

    const photo = page.getByRole("button", { name: /photo/i }).first();
    if (await t.sees(photo)) await t.act("choose a photo", async () => photo.click());

    // Wait for it rather than counting straight away. The capture surface is a
    // client component and the page ships a "Rendering…" placeholder first; a
    // count taken on the server-rendered HTML is zero, and the first version of
    // this journey reported "there is nowhere to attach a photo" about a screen
    // that has one.
    const file = page.locator('input[type="file"]').first();
    const attachable = await page
      .waitForFunction(() => document.querySelectorAll('input[type="file"]').length > 0, undefined, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    if (!attachable) {
      t.say("major", "stuck", "I chose photo and there is nowhere to attach one.");
      return;
    }
    await t.act("attach the picture I took", async () => {
      await file.setInputFiles(path.join(process.cwd(), "tests", "fixtures", "tiny.png"));
    });

    // The safeguarding-critical sentence: work a teacher adds publishes with no
    // approval step. If the screen does not say so, the teacher does not know.
    t.expects(
      await t.seesText(/straight away|no approval|publishes|goes into their (jar|journal)/i, 1500),
      "major",
      "confusing",
      "Nothing warns me that work I add for a child skips the approval queue and appears to the family immediately. That is exactly when a wrong photo goes home.",
    );

    const submit = page.getByRole("button", { name: /add to (journal|jar)|publish|save/i }).first();
    if (await t.sees(submit)) {
      await t.act("add it to their journal", async () => submit.click());
    }
    t.budget(8, "Adding a photo for a child who cannot do it themselves");
  });
});

test("send a piece of work back and watch the child pick it up", async ({ page, tester: t }) => {
  // The returned-work loop, from the child's side. The seed leaves one piece
  // already sent back with a note, so this tests the receiving half even if the
  // queue is empty.
  await signInChild(t, page, ACADEMY.classes.ks2.code, ACADEMY.returned.child);

  await carryOn(async () => {
    const flagged = await t.seesText(/again|\bback\b|another go|have another/i, 4000);
    t.expects(
      flagged,
      "major",
      "confusing",
      "My teacher sent work back for me to improve and my journal does not say so anywhere I can see.",
    );

    const noteVisible = await t.seesText(ACADEMY.returned.note, 4000);
    t.expects(
      noteVisible,
      "major",
      "confusing",
      "I cannot read what my teacher asked me to change without hunting for it. If I cannot find the note, I cannot act on it.",
    );

    // Can a ten-year-old actually get back INTO the work to redo it?
    const reopen = page
      .getByRole("link", { name: new RegExp(`${ACADEMY.activities.ks2}|again|open|carry on`, "i") })
      .first();
    t.expects(
      await t.sees(reopen),
      "major",
      "stuck",
      "There is nothing to tap that takes me back into the work my teacher wants me to change.",
    );
  });
});

test("export a class's evidence, the way a school inspection asks for it", async ({ page, tester: t }) => {
  await signIn(t, page, ACADEMY.teacher);
  await t.open("/teacher/class", "my classes");

  await carryOn(async () => {
    const exportLink = () => page.getByRole("link", { name: /export|download/i }).first();

    // Look where a teacher looks: the class list, then inside the class.
    let where = "";
    if (await t.sees(exportLink(), 1500)) where = "the class list";

    if (!where) {
      const klass = page.getByRole("button", { name: new RegExp(ACADEMY.classes.ks1.name, "i") }).first();
      if (await t.sees(klass)) {
        await t.act("open my class", async () => klass.click());
        await t.sweep("one class, open");
        if (await t.sees(exportLink(), 1500)) where = "the open class";
      }
    }

    // Then where it actually is: behind the settings mode, next to "delete this
    // class". Finding it there is a different finding from it not existing, and
    // the report has to tell them apart or somebody builds a second export.
    if (!where) {
      const settings = page.getByRole("button", { name: /class settings|settings/i }).first();
      if (await t.sees(settings, 1500)) {
        await t.act("try class settings", async () => settings.click());
        await t.sweep("class settings");
        if (await t.sees(exportLink(), 1500)) where = "class settings";
      }
    }

    t.expects(
      where !== "",
      "major",
      "stuck",
      "I cannot find any way to get a class's work out of Storyjar. A school answering a subject-access request, or leaving, needs this and I would be ringing support.",
    );
    t.expects(
      where !== "class settings",
      "major",
      "confusing",
      "The export exists, but it is inside “class settings”, beside the button that permanently deletes the class. A teacher asked for a copy of a child's work does not go looking in the settings screen — and the one place they do end up is one tap from destroying the lot.",
      `found under: ${where}`,
    );
    if (where) t.say("polish", "confusing", `Export was found under ${where}.`);
  });
});
