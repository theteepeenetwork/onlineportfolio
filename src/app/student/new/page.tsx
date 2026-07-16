import { redirect } from "next/navigation";

// This screen used to ask a child which way they wanted to add their work —
// after they had already tapped "Photo" or "Drawing" on their jar. It's gone
// (SJ-03): the tiles now deep-link straight to /student/new/photo, /drawing or
// /words.
//
// The route stays as a redirect rather than a 404, because a child on a
// bookmarked or shared link should land on their jar — a place they recognise —
// rather than an error they can't read.
export default async function StudentNewRedirect({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const legacy: Record<string, string> = {
    PHOTO: "/student/new/photo",
    TEXT: "/student/new/words",
    DRAWING: "/student/new/drawing",
  };
  redirect(type && legacy[type] ? legacy[type] : "/student");
}
