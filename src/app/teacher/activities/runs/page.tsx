import { redirect } from "next/navigation";

// Every run has its own page under this path; the list of them is the "Live
// now" section at the top of the activity library, so a trimmed URL goes there
// rather than to a 404.
export default function RunsIndex() {
  redirect("/teacher/activities#live-now");
}
