import { getCurrentParent } from "@/lib/parentAuth";
import { FamilySignIn } from "./FamilySignIn";
import { ParentHome } from "./ParentHome";

// The family space. Signed-in parents see their read-only home; everyone else
// sees the sign-in screen (magic link or family code).
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
  return <ParentHome parent={parent} />;
}
