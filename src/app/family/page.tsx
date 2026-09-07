import { getCurrentParent } from "@/lib/parentAuth";
import { markReadByParent, parentUnreadFor, threadForParent, type ThreadView } from "@/lib/messaging/threads";
import { FamilySignIn } from "./FamilySignIn";
import { ParentHome } from "./ParentHome";

// The family space. Signed-in parents see their home; everyone else sees the
// sign-in screen (magic link or family code).
//
// The jar is read-only. The one thing a parent can write is a message to their
// child's teacher, held to the school's office hours (SAFEGUARDING rule 21),
// loaded here per child through the parent↔child link and nothing else.
export default async function FamilyPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const parent = await getCurrentParent();
  if (!parent) {
    const { expired } = await searchParams;
    return <FamilySignIn expired={expired === "1"} />;
  }

  const threads: Record<string, ThreadView> = {};
  for (const child of parent.children) {
    const view = await threadForParent(parent.id, child.id);
    if (view) threads[child.id] = view;
  }
  // Opening the family space is reading it: the badge on the child's chip
  // counts replies that arrived since the parent was last here, and is
  // computed before the read marks below are written. This badge is the whole
  // notification model — nothing is emailed (SAFEGUARDING rule 6a).
  const unread: Record<string, number> = {};
  for (const child of parent.children) {
    unread[child.id] = await parentUnreadFor(parent.id, child.id);
  }
  await Promise.all(parent.children.map((c) => markReadByParent(parent.id, c.id)));

  return <ParentHome parent={parent} threads={threads} unread={unread} />;
}
