import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { StudentCapture, StudentDrawCapture } from "./StudentCapture";

// One route per way of adding work, so a tile on the child's jar deep-links
// straight into the thing it names. The URL says what you're doing — /photo,
// /drawing, /words — rather than a ?type= on a screen that asks again.
const SURFACES = {
  photo: "PHOTO",
  words: "TEXT",
  drawing: "DRAWING",
  audio: "AUDIO",
} as const;

type Surface = keyof typeof SURFACES;

export default async function StudentCapturePage({
  params,
}: {
  params: Promise<{ type: string }>;
}) {
  const user = await getCurrentUser();
  if (user?.role !== "STUDENT") redirect("/");

  const { type } = await params;
  // An unrecognised type (e.g. /student/new/nonsense) used to call notFound(),
  // which unwinds the async component before Next.js closes a performance.measure
  // — causing a TypeError crash. A redirect to the jar is quieter and puts the
  // child back somewhere they know, which is the same logic the /student/new
  // tombstone uses (see ../page.tsx:22).
  if (!(type in SURFACES)) redirect("/student");

  const kind = SURFACES[type as Surface];
  return kind === "DRAWING" ? <StudentDrawCapture /> : <StudentCapture type={kind} mode={user.student.ageMode} />;
}
