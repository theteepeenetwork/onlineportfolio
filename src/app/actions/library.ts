"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { requireWritableAccount } from "@/lib/billing";
import {
  canPublish,
  publishTemplate,
  setPublished,
  updateLibraryActivity,
} from "@/lib/libraryPublishing";

// Publishing to StoryJar's own activity library.
//
// WHO CAN REACH ANY OF THIS
//
// A signed-in teacher whose school has `canPublishToLibrary` — StoryJar
// Academy, and nowhere else. The flag is set by scripts/ops/seed-academy.mjs or
// by a migration and no screen anywhere writes it, so there is no sequence of
// clicks at a real school that ends here. Every action below re-asks rather
// than trusting the screen that rendered the button, because a Server Action is
// a POST endpoint anybody can craft a request to.
//
// The actual work lives in src/lib/libraryPublishing.ts, which is the one
// module under src/ permitted to write the shared table. That is asserted, not
// assumed, in tests/battery/security/shared-activities.spec.ts.
//
// WHY THE FAILURE IS notFound() AND NOT A MESSAGE
//
// A school that cannot publish should not learn that publishing exists. The
// same posture the operator console takes for its own screens, for the same
// reason: an error that names a capability is a map to it.

async function actingPublisher(): Promise<string> {
  const user = await getCurrentUser();
  if (user?.role !== "TEACHER") redirect("/");
  if (!(await requireWritableAccount()).ok) redirect("/teacher/account?frozen=1");
  if (!(await canPublish(user.teacher.id))) redirect("/teacher/activities");
  return user.teacher.id;
}

function refresh() {
  revalidatePath("/teacher/activities");
  revalidatePath("/teacher/activities/library");
  revalidatePath("/teacher/activities/shared");
}

/**
 * Promote a template into the library, or update the activity it is already
 * published as. It never makes anything visible — that is a second, separate
 * act, below.
 */
export async function publishTemplateToLibrary(formData: FormData) {
  const teacherId = await actingPublisher();

  const outcome = await publishTemplate({
    teacherId,
    templateId: String(formData.get("templateId") ?? ""),
    ageMode: readBand(formData.get("ageMode")),
    sortOrder: readOrder(formData.get("sortOrder")),
  });
  if (!outcome.ok) redirect("/teacher/activities/library?problem=1");

  refresh();
  redirect("/teacher/activities/library?published=1");
}

// The band vocabulary, in one place. "" means no band suggested, which on
// SharedActivity means "offer it to everybody" — NOT the same null as
// Class.ageMode, where null resolves to the youngest register because it decides
// what a child sees. The schema comment on that column warns against reading it
// with resolveAgeMode() for exactly this reason.
const BANDS = ["EYFS", "KS1", "KS2"];
const readBand = (raw: FormDataEntryValue | null) => {
  const value = String(raw ?? "").trim();
  return BANDS.includes(value) ? value : null;
};
const readOrder = (raw: FormDataEntryValue | null) => {
  const value = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(value) ? value : 0;
};

/** The age band and the position in the shelf. */
export async function updateLibraryActivityDetails(formData: FormData) {
  const teacherId = await actingPublisher();

  const outcome = await updateLibraryActivity(
    teacherId,
    String(formData.get("slug") ?? ""),
    readBand(formData.get("ageMode")),
    readOrder(formData.get("sortOrder")),
  );
  if (!outcome.ok) redirect("/teacher/activities/library?problem=1");

  refresh();
  redirect("/teacher/activities/library?saved=1");
}

/** Make a published activity visible to teachers, or withdraw it. */
export async function setLibraryActivityPublished(formData: FormData) {
  const teacherId = await actingPublisher();

  const slug = String(formData.get("slug") ?? "");
  const published = String(formData.get("published") ?? "") === "1";

  const outcome = await setPublished(teacherId, slug, published);
  if (!outcome.ok) redirect("/teacher/activities/library?problem=1");

  refresh();
  redirect(`/teacher/activities/library?${published ? "visible" : "withdrawn"}=1`);
}
