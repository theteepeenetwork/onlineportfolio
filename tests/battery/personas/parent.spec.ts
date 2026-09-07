import { userTest as test, carryOn } from "./tester";
import { TEAM } from "./team";
import { ACADEMY } from "./world";

// ===========================================================================
// Priya, a parent, on a phone, in the evening.
//
// She has a letter with a code on it and no idea what Storyjar is. Nobody has
// trained her, she will not create an account, and if the first screen asks her
// to, she puts the phone down. This journey is the whole of her relationship
// with the product.
// ===========================================================================

test.use({ persona: TEAM.parent });

test("a parent with a letter finds her child's work", async ({ page, tester: t }) => {
  await t.open("/", "the Storyjar home page");

  // First question a parent asks: is any of this for me?
  const forFamilies = page.getByRole("link", { name: /family|families|parent|grown-?up/i }).first();
  const signposted = (await forFamilies.count()) > 0;
  t.expects(
    signposted,
    "major",
    "confusing",
    "Nothing on the first screen speaks to a parent. Everything is addressed to teachers and schools, so the letter's code has no obvious door.",
  );

  await t.open("/family", "the family sign-in page");

  await carryOn(async () => {
    await t.act("open the family-code form", async () => {
      await page.getByRole("button", { name: /family code from your letter/i }).click();
    });
    await t.sweep("the family-code form");

    // A parent types the code exactly as printed. Case and spacing are the
    // commonest real-world mistake, so try it the way a tired person would.
    await t.act("type the code from the letter", async () => {
      await page.getByLabel(/family code from your letter/i).fill(` ${ACADEMY.parents.siblings.code.toLowerCase()} `);
    });
    await t.act("sign in", async () => {
      await page.getByRole("button", { name: /^sign in$/i }).click();
    });

    const landed = await t.sees(page.getByRole("heading", { name: /grown-?ups/i }));
    t.expects(
      landed,
      "major",
      "stuck",
      "The code from the letter was refused because of how it was typed (lower case with a stray space). A parent reads that as “the school gave me a wrong code”, not as a formatting rule.",
      `entered “ ${ACADEMY.parents.siblings.code.toLowerCase()} ” for ${ACADEMY.parents.siblings.code}`,
    );

    if (!landed) {
      // Recover the way she would: retype it carefully, in capitals.
      await t.act("try again in capitals", async () => {
        await page.getByLabel(/family code from your letter/i).fill(ACADEMY.parents.siblings.code);
        await page.getByRole("button", { name: /^sign in$/i }).click();
      });
    }

    await t.sweep("my child's page");
    t.budget(6, "Getting from the letter to my child's work");
  });

  await carryOn(async () => {
    // What she came for: is there anything new, and can she tell what it is?
    const anyWork = await t.seesText(/minibeast|river|drawing|photo|words|voice/i);
    t.expects(
      anyWork,
      "major",
      "confusing",
      "I cannot tell whether my child has done anything. The page loads but nothing on it looks like their work.",
    );

    // The promise that stops a parent worrying: this is only approved work, and
    // she cannot break anything.
    const readOnly = await t.seesText(/only.*approved|only their teacher can add or change/i);
    t.expects(
      readOnly,
      "minor",
      "confusing",
      "Nothing says whether I am allowed to change any of this, or whether my child sees what I do here. A parent worries about both.",
    );
  });

  await carryOn(async () => {
    // Two children at the school — a very common case, and the one that most
    // often gets forgotten.
    const sibling = page.getByRole("button", { name: new RegExp(ACADEMY.parents.siblings.children[1], "i") }).first();
    if (await sibling.count()) {
      t.newJob();
      await t.act("switch to my other child", async () => sibling.click());
      await t.sweep("my other child's page");
      t.budget(2, "Switching between my two children");
    } else {
      t.say(
        "minor",
        "confusing",
        "I have two children at this school and can only see one of them. Nothing explains where the other is or that I need a second code.",
      );
    }
  });

  await carryOn(async () => {
    // The question every parent asks about a product holding photos of their
    // child, and the one a school gets phoned about.
    const privacy = page.getByRole("link", { name: /privacy|how we look after|data/i }).first();
    t.expects(
      (await privacy.count()) > 0,
      "minor",
      "confusing",
      "There is no link from my child's page to anything explaining who can see these photos or how long they are kept.",
      "a question schools field by phone when the app does not answer it",
    );
  });

  // Leaving: a shared family phone makes this a safeguarding matter, not a nicety.
  const signOut = page.getByRole("button", { name: /sign out|log out/i }).first();
  t.expects(
    (await signOut.count()) > 0,
    "major",
    "fragile",
    "I cannot find a way to sign out. On a shared family phone the next person to open the browser is still signed in to my child's journal.",
  );
});

test("a parent who mistypes the code is told what to do next", async ({ page, tester: t }) => {
  // Deliberately wrong: the message that comes back is the whole test.
  t.tolerate(/429|401|403/);
  await t.open("/family", "the family sign-in page");

  await carryOn(async () => {
    await t.act("open the family-code form", async () => {
      await page.getByRole("button", { name: /family code from your letter/i }).click();
    });
    await t.act("enter a code with a typo", async () => {
      await page.getByLabel(/family code from your letter/i).fill("BRAMXX");
      await page.getByRole("button", { name: /^sign in$/i }).click();
    });

    const refusal = page.getByText(/code|sorry|try|check/i).first();
    const message = (await t.sees(refusal)) ? await refusal.innerText().catch(() => "") : "";
    t.expects(
      message.length > 0,
      "major",
      "confusing",
      "A wrong code produced no message I could find. I do not know whether it failed, or whether I should wait.",
    );
    t.expects(
      /ask|school|teacher|letter|again/i.test(message),
      "minor",
      "confusing",
      "The refusal does not tell me what to do next — a parent needs “check the letter or ask the school office”, not just “that did not work”.",
      message.slice(0, 200),
    );
  });
});

// ---------------------------------------------------------------------------
// The same parent, later the same evening, with something to tell the teacher.
//
// Bramblewood has switched messages on, Monday to Friday 08:00–16:00. It is
// evening, or a weekend, when she does this — so the interesting question is
// not whether the message goes, but whether what she is told about WHEN it
// goes reads as an explanation or as a brush-off. During the day the same
// journey simply sends, and she should be told that plainly instead.
// ---------------------------------------------------------------------------

test("a parent writes to the teacher at nine at night", async ({ page, tester: t }) => {
  await t.open("/family", "the family sign-in page");
  await carryOn(async () => {
    await t.act("open the family-code form", async () => {
      await page.getByRole("button", { name: /family code from your letter/i }).click();
    });
    await t.act("sign in with the code from the letter", async () => {
      await page.getByLabel(/family code from your letter/i).fill(ACADEMY.parents.siblings.code);
      await page.getByRole("button", { name: /^sign in$/i }).click();
    });
    await t.sees(page.getByRole("heading", { name: /grown-?ups/i }));
  });

  await carryOn(async () => {
    // Is there anywhere to write at all, and can she tell who will read it?
    const box = page.getByLabel("Your message");
    const found = await t.sees(box);
    t.expects(
      found,
      "major",
      "stuck",
      "I have something to tell the teacher and there is nowhere on my child's page to say it. If the school has switched messages on, I cannot find the box.",
    );
    if (!found) return;

    const whoReads = await t.seesText(/who can see this/i);
    t.expects(whoReads, "major", "confusing", "I cannot tell who will read what I write. A parent needs the names before typing anything about their child.");

    const emergency = await t.seesText(/not for emergencies|phone the school office/i);
    t.expects(
      emergency,
      "major",
      "confusing",
      "Nothing tells me this is not the place for something urgent. If my child were unwell I might have typed it here and waited.",
    );

    await t.act("write to the teacher", async () => {
      await box.fill("Nell has been talking about the minibeast hunt all evening. Is there anything she should bring in?");
    });
    await t.act("send it", async () => {
      await page.getByRole("button", { name: /^send$/i }).click();
    });

    const status = page.getByRole("status").first();
    const sent = await t.sees(status);
    const said = sent ? (await status.innerText().catch(() => "")) : "";
    t.expects(sent && /sent/i.test(said), "blocker", "stuck", "I pressed send and nothing told me whether it went.", said.slice(0, 160));

    if (/outside school hours/i.test(said)) {
      // Held. Does the explanation tell her a DAY and a TIME, in words she would
      // use, rather than a countdown or a system word?
      t.expects(
        /\d{1,2}:\d{2}(am|pm)/i.test(said) && /(today|tomorrow|monday|tuesday|wednesday|thursday|friday)/i.test(said),
        "major",
        "confusing",
        "It says my message is waiting but not when it will actually reach the teacher. “At 8:00am tomorrow” is an answer; anything less is a worry.",
        said.slice(0, 200),
      );
      t.expects(
        !/queue|deliver(y|ed) window|pending|scheduled/i.test(said),
        "minor",
        "confusing",
        "The message about waiting uses system words. A parent understands “school hours”, not “queued” or “delivery window”.",
        said.slice(0, 200),
      );
      // Her own message is still on the page, so she can see it went in.
      const mineShown = await t.seesText(/minibeast hunt all evening/i);
      t.expects(mineShown, "major", "confusing", "After sending, my message vanished. I cannot tell whether it is waiting or lost.");
    } else {
      const plain = /sent\.?\s*$/i.test(said.trim()) || /^✓?\s*sent/i.test(said.trim());
      t.expects(plain, "minor", "confusing", "During school hours the message should simply say it was sent, without a warning about waiting.", said.slice(0, 160));
    }

    await t.sweep("my child's page after writing to the teacher");
    t.budget(5, "Telling the teacher something in the evening");
  });
});
