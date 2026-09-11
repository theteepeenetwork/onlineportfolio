import { test, expect, type Page } from "@playwright/test";
import { teacherLogin } from "./helpers";

// "Show code & QR" on the Journals dashboard puts the class code up on the
// classroom board. It covers the dashboard completely, because behind it are
// the pupils' names and who has work waiting. Opaque to the eye is not enough:
// while the card is up the page behind it is inert, so neither Tab nor a screen
// reader on the projecting laptop can reach a pupil's name, and when it closes
// the page is given back and focus returns to the button that opened it.

const card = (page: Page) => page.getByRole("dialog", { name: /Class code and QR for/ });

async function openCard(page: Page) {
  await teacherLogin(page);
  const opener = page.getByRole("button", { name: /Show code & QR/ });
  await opener.click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole("button", { name: "Done" })).toBeFocused();
  return opener;
}

// Where focus is, as "card", "nothing", or a description of what it landed on.
const focusIsOn = (page: Page) =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return "nothing";
    return a.closest('[role="dialog"]') ? "card" : `${a.tagName} ${a.textContent?.slice(0, 40)}`;
  });

test("the page behind the class code is inert, and Tab never leaves the card", async ({ page }) => {
  const opener = await openCard(page);

  // The pupils' links are under an inert ancestor; the card is not.
  const pupilLinks = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href^="/teacher/students/"]')).map((el) => !!el.closest("[inert]")),
  );
  expect(pupilLinks.length, "the demo class has pupils on the dashboard").toBeGreaterThan(0);
  expect(pupilLinks.every(Boolean), "every pupil link is inert behind the card").toBe(true);
  expect(await card(page).evaluate((el) => !!el.closest("[inert]")), "the card itself is not").toBe(false);
  expect(await opener.evaluate((el) => !!el.closest("[inert]")), "the opener is behind it too").toBe(true);

  // And what a screen reader is given. This asks Chromium for its own
  // accessibility tree, the one assistive technology reads, rather than
  // Playwright's ariaSnapshot, which computes its own and does not honour
  // inert — it lists every pupil link above. Behind the card, nothing but the
  // card is exposed: no pupil's name, no "Open the queue".
  const pupil = (await page.locator('a[href^="/teacher/students/"]').first().innerText()).split("\n")[0].trim();
  expect(pupil.length).toBeGreaterThan(0);
  const cdp = await page.context().newCDPSession(page);
  const { nodes } = (await cdp.send("Accessibility.getFullAXTree")) as {
    nodes: { ignored: boolean; name?: { value?: unknown } }[];
  };
  const exposed = nodes.filter((n) => !n.ignored).map((n) => String(n.name?.value ?? ""));
  expect(exposed, "the card is in the tree").toContain("Done");
  expect(exposed.some((name) => name.includes(pupil)), `a screen reader is not given ${pupil}'s name`).toBe(false);
  expect(exposed.some((name) => name.includes("Open the queue")), "nor the dashboard round it").toBe(false);
  await cdp.detach();

  // Forwards and backwards from Done, however far, focus is on the card or on nothing.
  for (let n = 0; n < 6; n++) {
    await page.keyboard.press("Tab");
    expect(["card", "nothing"], `Tab ${n + 1} must stay on the card`).toContain(await focusIsOn(page));
  }
  for (let n = 0; n < 6; n++) {
    await page.keyboard.press("Shift+Tab");
    expect(["card", "nothing"], `Shift+Tab ${n + 1} must stay on the card`).toContain(await focusIsOn(page));
  }

  // Escape closes it; the page is given back and focus returns to the opener.
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length), "nothing is left inert").toBe(0);
});

test("Done closes the class code and gives focus back to the opener", async ({ page }) => {
  const opener = await openCard(page);
  await card(page).getByRole("button", { name: "Done" }).click();
  await expect(card(page)).toHaveCount(0);
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length)).toBe(0);

  // And it opens again, inert again: the release did not break a second showing.
  await opener.click();
  await expect(card(page)).toBeVisible();
  expect(
    await page.evaluate(() => !!document.querySelector('a[href^="/teacher/students/"]')?.closest("[inert]")),
  ).toBe(true);
});

// Leaving through "Print for the classroom door" unmounts the card rather than
// closing it. The page it goes to must not inherit anything inert.
test("leaving by the print link leaves nothing inert on the next page", async ({ page }) => {
  await openCard(page);
  await card(page).getByRole("link", { name: /Print for the classroom door/ }).click();
  await page.waitForURL(/\/signup\/teacher\/welcome\?class=/);
  await expect(page.getByRole("heading", { name: /class code/ })).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("[inert]").length), "nothing is inert").toBe(0);
  await page.keyboard.press("Tab");
  expect(await focusIsOn(page), "Tab reaches a control on the new page").not.toBe("nothing");
});
