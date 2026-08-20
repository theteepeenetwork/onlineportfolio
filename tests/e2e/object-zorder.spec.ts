import { test, expect } from "@playwright/test";
import { teacherLogin } from "./helpers";

// Objects paint in array order (later = on top), for both the live canvas and
// the flattened image. The floating object toolbar lets a teacher restack them.
test("teacher can bring an object to the front and send it to the back", async ({ page }) => {
  await teacherLogin(page);
  await page.goto("/teacher/activities/new");
  await page.locator("#title").fill("Layering");
  await page.getByRole("button", { name: /Build a template/ }).click();

  const addShape = async (name: string) => {
    await page.locator('button[title="Add"]').click();
    await page.getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name }).click();
  };

  // Paint order, read off `data-shape` — the attribute the canvas puts on the
  // element that draws each object precisely so the DOM says what it is.
  //
  // This used to infer the kind from path data ("an ellipse's path has an A
  // arc; a star's does not"), which counted every stroked path inside the
  // object wrapper — including the icons in the object's own floating toolbar
  // the moment one of them gained a coloured stroke. The toolbar is not an
  // object and was never meant to be in this list.
  const order = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("div.touch-none svg[data-shape]")].map(
        (el) => el.getAttribute("data-shape") ?? "",
      ),
    );

  await addShape("Circle");
  await addShape("Star"); // added last → painted on top, and now selected
  expect(await order()).toEqual(["ellipse", "star"]);

  // Send the star behind the circle.
  await page.getByRole("button", { name: "Send to back", exact: true }).click();
  expect(await order()).toEqual(["star", "ellipse"]);

  // Bring it back in front.
  await page.getByRole("button", { name: "Bring to front", exact: true }).click();
  expect(await order()).toEqual(["ellipse", "star"]);
});
