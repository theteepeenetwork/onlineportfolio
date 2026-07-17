import { test, expect } from "@playwright/test";
import { loginStudent, fetchStatus, SCHOOL_A } from "../helpers";
test("a child can load the template background of an activity set to them", async ({ page }) => {
  await loginStudent(page, SCHOOL_A.classCode, "Amara");
  // Amara is set the Minibeast activity (wholeClass) and has no response of her
  // own — her to-do thumbnail is the TEMPLATE background.
  const status = await fetchStatus(page, "/uploads/seed-tmpl-bug.svg");
  console.log("PROBE template background for a set child:", status);
  // And the old shared file: still a child's response media, correctly refused
  // to a child who doesn't own it.
  const shared = await fetchStatus(page, "/uploads/seed-bug.svg");
  console.log("PROBE another child's response media:", shared);
  expect(status).toBe(200);
});
