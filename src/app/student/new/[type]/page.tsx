import { notFound, redirect } from "next/navigation";
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
  if (!(type in SURFACES)) notFound();

  const kind = SURFACES[type as Surface];
  return kind === "DRAWING" ? <StudentDrawCapture /> : <StudentCapture type={kind} mode={user.student.ageMode} />;
}
