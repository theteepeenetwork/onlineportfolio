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
