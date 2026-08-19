import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";
import { signInChild, scribble } from "./actions";

// ===========================================================================
// The children.
//
// Three registers, three different products: a four-year-old who cannot read,
// a six-year-old who sounds words out, and a ten-year-old who reads everything
// including the bits meant for adults.
//
// A child cannot file a bug. Everything they would have shrugged at and given
// up on has to be caught here.
// ===========================================================================

// ---------------------------------------------------------------------------
// Reception, aged four. Cannot read. Navigates by picture.
// ---------------------------------------------------------------------------
test.describe("Bo, aged 4", () => {
  test.use({ persona: TEAM.eyfsChild });

  test("find my own name, my jar, and the thing my teacher left me", async ({ page, tester: t }) => {
    await t.open(`/login/student?code=${ACADEMY.classes.eyfs.code}`, "the name wall");

    await carryOn(async () => {
      // A non-reader finds their name by its shape and colour. It must be big,
      // and it must not need reading.
      const me = page.getByRole("button", { name: ACADEMY.classes.eyfs.children[0], exact: true });
      const there = await t.sees(me);
      t.expects(there, "blocker", "stuck", "I cannot find my name to tap, so I cannot get in at all.");
      if (!there) return;

      const box = await me.boundingBox();
      if (box) {
        t.expects(
          box.height >= 64 && box.width >= 64,
          "major",
          "unreadable",
          `My name card is ${Math.round(box.width)}×${Math.round(box.height)}px. At four I tap with a whole finger.`,
        );
      }

      await t.act("tap my name", async () => {
        await me.click();
        await page.waitForURL((url) => url.pathname === "/student");
      });
      await t.sweep("my jar");
      t.budget(3, "Getting in");
    });

    // The payoff: a sticker my teacher sent. For a four-year-old this IS the
    // product, and it must work without a word being read.
    await carryOn(async () => {
      t.newJob();
      const sticker = await t.seesText(/heart|💛|back/i, 3000);
      const anyPicture = (await page.locator("img, svg").count()) > 0;
      t.expects(
        sticker || anyPicture,
        "major",
        "confusing",
        "There is nothing on my jar that shows me my teacher liked my work. I cannot read, so if it is only words, it is not there.",
      );

      // Everything a four-year-old needs must be a picture, not a word.
      const tiles = await page.getByRole("button").all();
      let wordOnly = 0;
      for (const tile of tiles.slice(0, 12)) {
        const text = ((await tile.innerText().catch(() => "")) || "").trim();
        const hasPicture = (await tile.locator("img, svg").count()) > 0;
        if (text && !hasPicture && /^[A-Za-z ]{3,}$/.test(text)) wordOnly++;
      }
      t.expects(
        wordOnly <= 2,
        "major",
        "unreadable",
        `${wordOnly} of the buttons on my jar are words with no picture. I cannot read any of them, so I tap at random or ask an adult.`,
      );
    });
  });

  test("do the quiz my teacher set, with pictures for answers", async ({ page, tester: t }) => {
    await signInChild(t, page, ACADEMY.classes.eyfs.code, ACADEMY.classes.eyfs.children[0]);

    await carryOn(async () => {
      await t.open("/student/activities", "the things I have to do");
      const activity = page.getByRole("link", { name: new RegExp(ACADEMY.activities.quiz, "i") }).first();
      const found = await t.sees(activity, 4000);
      t.expects(
        found,
        "blocker",
        "stuck",
        "The thing my teacher set is not somewhere I can find and tap.",
      );
      if (!found) return;

      await t.act("open it", async () => activity.click());
      await page.waitForTimeout(2000);
      await t.sweep("the quiz");

      // A pre-reader's quiz has to be answerable from the pictures alone.
      const withPictures = await page.locator('button:has(img), [role="button"]:has(img)').count();
      t.expects(
        withPictures > 0,
        "major",
        "unreadable",
        "The answers are words. I cannot read, so I am guessing — and my teacher will think I do not know the answer.",
      );

      // Is the question read to me? Everything else in this register is.
      t.expects(
        (await page.getByRole("button", { name: /🔊|listen|read|hear/i }).count()) > 0,
        "major",
        "unreadable",
        "Nothing reads the question to me. In the register built for children who cannot read, the question is the one thing that stays silent.",
      );
      t.budget(5, "Doing the activity my teacher set");
    });
  });
});

// ---------------------------------------------------------------------------
// Year 2, aged six. Sounds words out, gives up on long ones, taps twice.
// ---------------------------------------------------------------------------
test.describe("Nell, aged 6", () => {
  test.use({ persona: TEAM.ks1Child });

  test("put a drawing in my jar", async ({ page, tester: t }) => {
    await signInChild(t, page, ACADEMY.classes.ks1.code, "Rae");

    await carryOn(async () => {
      const draw = page.getByRole("link", { name: /draw/i }).first();
      const found = await t.sees(draw, 3000);
      t.expects(found, "blocker", "stuck", "I cannot find how to draw something.");
      if (!found) return;

      await t.act("choose drawing", async () => draw.click());
      await page.waitForTimeout(800);
      await t.sweep("my drawing page");

      await t.act("draw something", async () => scribble(page));

      // The commonest six-year-old failure: tapping the finish button twice
      // because nothing happened fast enough.
      const done = page.locator('button[title="Done"]');
      if (!(await t.sees(done, 3000))) {
        t.say("blocker", "stuck", "I have drawn my picture and I cannot find how to finish.");
        return;
      }
      await t.act("finish", async () => done.click());
      await page.waitForTimeout(400);
      // Tap it again, the way a child does when a screen has not changed yet.
      const stillThere = await t.sees(done, 600);
      if (stillThere) {
        await done.click().catch(() => {});
        t.say(
          "major",
          "fragile",
          "Nothing changed when I pressed finish, so I pressed it again. If that puts two of my pictures in, my teacher gets the same drawing twice.",
        );
      }

      await page.waitForURL((url) => url.pathname === "/student/popped" || url.pathname === "/student", { timeout: 15000 }).catch(() => {});
      await t.sweep("after finishing");

      // Where did it go? A six-year-old needs to be told, in six-year-old words.
      t.expects(
        await t.seesText(/teacher|waiting|jar|popped|well done/i, 3000),
        "major",
        "confusing",
        "I finished my picture and I do not know where it went or whether anyone will see it.",
      );
      t.budget(6, "Putting a drawing in my jar");
    });
  });

  test("say something out loud instead of writing it", async ({ page, tester: t }) => {
    // The reason this product exists for early years: a child who cannot write
    // can still say what they made.
    await signInChild(t, page, ACADEMY.classes.ks1.code, "Tia");

    await carryOn(async () => {
      const voice = page.getByRole("button", { name: /voice/i }).first();
      const found = await t.sees(voice, 3000);
      t.expects(found, "major", "stuck", "I cannot find how to record my voice.");
      if (!found) return;

      await t.act("choose voice", async () => voice.click());
      await t.sweep("the voice recorder");

      t.expects(
        await t.seesText(/record|tap|press|hold/i, 2000),
        "major",
        "unreadable",
        "Nothing shows me what to do to start recording. A microphone picture on its own does not tell a six-year-old to press and talk.",
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Year 6, aged ten. Reads everything and pokes at the edges.
// ---------------------------------------------------------------------------
test.describe("Wren, aged 10", () => {
  test.use({ persona: TEAM.ks2Child });

  test("do the work my teacher sent back, and check it went", async ({ page, tester: t }) => {
    await signInChild(t, page, ACADEMY.classes.ks2.code, ACADEMY.returned.child);

    await carryOn(async () => {
      t.expects(
        await t.seesText(/again|back|improve|redo|carry on/i, 3000),
        "major",
        "confusing",
        "My teacher sent my work back and my journal does not tell me. I would only find out by opening everything.",
      );
      t.expects(
        await t.seesText(ACADEMY.returned.note, 3000),
        "major",
        "confusing",
        "I cannot see what my teacher asked me to change without going hunting for it.",
      );
    });

    // Ten-year-olds use the back button. Constantly.
    await carryOn(async () => {
      t.newJob();
      await t.open("/student/activities", "my activities");
      await t.act("go back", async () => {
        await page.goBack();
        await page.waitForLoadState("domcontentloaded");
      });
      await t.sweep("back on my journal");
      t.expects(
        !(await t.seesText(/expired|again|error|sorry/i, 1200)),
        "major",
        "fragile",
        "Using the back button broke something. I use back all the time.",
      );
    });

    // And they reload mid-task to see if it saves.
    await carryOn(async () => {
      t.newJob();
      const words = page.getByRole("button", { name: /my words|write/i }).first();
      if (!(await t.sees(words, 2500))) return;
      await t.act("start writing something", async () => words.click());
      const box = page.getByRole("textbox").first();
      if (!(await t.sees(box, 2500))) return;
      await t.act("type a sentence", async () => box.fill("I worked it out by counting in tens and then adding the ones."));
      await t.act("reload the page halfway through", async () => {
        await page.reload({ waitUntil: "domcontentloaded" });
      });
      const kept = await t.seesText(/counting in tens/i, 4000);
      t.expects(
        kept,
        "major",
        "fragile",
        "I reloaded while I was typing and everything I had written was gone, with nothing to say it had been lost.",
      );
    });
  });

  test("what can I see about myself, and can I get out?", async ({ page, tester: t }) => {
    await signInChild(t, page, ACADEMY.classes.ks2.code, "Yara");

    await carryOn(async () => {
      // A ten-year-old is entitled to know this, and the ICO Children's Code
      // expects it to be in language they understand.
      t.expects(
        await t.seesText(/who can see|your teacher|grown-?up|private|only you/i, 3000),
        "minor",
        "confusing",
        "Nothing tells me who can see my work. I would like to know whether my mum sees it, or just my teacher.",
      );

      const out = page.getByRole("button", { name: /sign out|bye/i }).first();
      t.expects(
        await t.sees(out, 2000),
        "major",
        "fragile",
        "I cannot sign out. On a shared classroom laptop the next person is still me.",
      );
      if (await t.sees(out, 1000)) {
        await t.act("sign out", async () => out.click());
        await page.waitForTimeout(1500);
        t.expects(
          !/\/student(\/|$)/.test(new URL(page.url()).pathname),
          "major",
          "fragile",
          "I pressed sign out and I am still in my journal.",
        );
      }
    });
  });
});
