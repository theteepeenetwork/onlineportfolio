import { test, expect, type Page } from "@playwright/test";
import { SCHOOL_B, loginStudent } from "../helpers";

// ===========================================================================
// Reading an ADULT'S OWN WORDS aloud never leaves the device.
//
// Storyjar's own fixed copy is safe to speak anywhere: it discloses nothing.
// A teacher's words are not. On some platforms — Android Chrome is the named
// one — `speechSynthesis` ships the text it speaks to a cloud voice service
// with no DPA, which SAFEGUARDING rules 10 and 11 forbid. The 2026-08-19 scope
// note permits speaking a teacher's own text through a voice the platform
// reports as running on the device (`SpeechSynthesisVoice.localService === true`)
// and through nothing else.
//
// The mechanism is deny-by-default and the failure is silence: no local voice,
// no button, and the words stay on screen beside a teacher. That is the rule
// this file exists to hold, on the quiz question a pre-reader has to answer —
// the register built for children who cannot read is exactly where the
// temptation to "just speak it" is strongest.
//
// Voices cannot be arranged on a real headless browser, so the platform is
// stubbed. What is being tested is our decision, not Chromium's voice list.
// ===========================================================================

type FakeVoice = { name: string; lang: string; localService: boolean };

/** Replace the platform's speech with one we control, before any page script runs. */
async function withVoices(page: Page, voices: FakeVoice[]) {
  await page.addInitScript((vs) => {
    const spoken: { text: string; voice: string | null }[] = [];
    (window as unknown as { __spoken: typeof spoken }).__spoken = spoken;
    class FakeUtterance {
      text: string;
      voice: FakeVoice | null = null;
      lang = "";
      rate = 1;
      constructor(text: string) {
        this.text = text;
      }
    }
    const synth = {
      getVoices: () => vs,
      cancel() {},
      speak(u: FakeUtterance) {
        spoken.push({ text: u.text, voice: u.voice?.name ?? null });
      },
      addEventListener() {},
      removeEventListener() {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      value: FakeUtterance,
      configurable: true,
    });
  }, voices);
}

// Oakfield's "Oak leaf quiz" is live to the whole of Acorn, which has no
// ageMode and so resolves to EYFS — the register this is for. Zara has already
// answered it and cannot reopen it; Yusuf has not.
const QUESTION = "Which picture shows the Oakfield oak leaf?";

/** Everything the fake platform has been asked to say, in order. */
async function spokenSoFar(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __spoken: { text: string; voice: string | null }[] }).__spoken,
  );
}

async function openTheQuiz(page: Page) {
  await loginStudent(page, SCHOOL_B.classCode, "Yusuf");
  await page.goto("/student/activities");
  await page.getByRole("link", { name: /Oak leaf quiz/ }).first().click();
  await expect(page.locator("canvas").first()).toBeVisible();
}

test("a pre-reader can hear the question, spoken by an on-device voice", async ({ page }) => {
  await withVoices(page, [{ name: "Local GB", lang: "en-GB", localService: true }]);
  await openTheQuiz(page);

  const listen = page.getByRole("button", { name: new RegExp(`Hear it: ${QUESTION}`) });
  await expect(listen, "a child who cannot read the question cannot do the activity").toBeVisible();

  // Nothing has been said yet, and that is a rule rather than a coincidence:
  // read-aloud is user-initiated, every time (WCAG 1.4.2). Thirty tablets
  // talking at once when a class opens the same activity is its own classroom
  // failure, and a child must be the one who starts the sound.
  expect(await spokenSoFar(page), "nothing may speak on its own").toEqual([]);

  await listen.click();

  const spoken = await spokenSoFar(page);
  expect(spoken.map((s) => s.text)).toEqual([QUESTION]);
  expect(spoken[0].voice, "spoken by the local voice, explicitly — never the default").toBe("Local GB");

  // The scope boundary, asserted rather than assumed. The amendment covers the
  // QUESTION. The answer options are a teacher's words too, and extending to
  // them is a decision nobody has taken yet — so if this ever starts speaking
  // them, it should be because someone chose to, not because a helper grew.
  const answers = await page.evaluate(() =>
    [...document.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") ?? ""),
  );
  expect(answers, "the seeded quiz's answers are on screen to have been spoken").toContain(
    "The oak leaf",
  );
  expect(
    spoken.some((s) => /oak leaf|Not this one/.test(s.text) && s.text !== QUESTION),
    "only the question is inside the scope note — the answers are not",
  ).toBe(false);
});

test("with no on-device voice there is no button, and nothing is spoken", async ({ page }) => {
  // A cloud voice is what Android Chrome offers. It is not a fallback: it is
  // the thing being refused.
  await withVoices(page, [{ name: "Cloud GB", lang: "en-GB", localService: false }]);
  await openTheQuiz(page);

  await expect(
    page.getByRole("button", { name: /Hear it:/ }),
    "a remote voice must never be offered — the failure is silence, not a fallback",
  ).toHaveCount(0);
  expect(await spokenSoFar(page)).toEqual([]);
});

test("a voice that does not say where it runs is treated as remote", async ({ page }) => {
  // An older implementation may omit `localService` entirely. Unknown is not a
  // maybe — deny by default (SAFEGUARDING rule 8).
  await withVoices(page, [{ name: "Mystery GB", lang: "en-GB" } as FakeVoice]);
  await openTheQuiz(page);

  await expect(page.getByRole("button", { name: /Hear it:/ })).toHaveCount(0);
});
