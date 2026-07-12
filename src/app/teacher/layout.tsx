import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { accountStateForTeacher } from "@/lib/billing";
import { FrozenBanner } from "@/components/FrozenBanner";

// Guard: everything under /teacher requires a signed-in teacher.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/teacher");
  if (user.role !== "TEACHER") redirect("/student");

  // Surface a read-only banner when the account is frozen. This also settles a
  // lapsed trial into FROZEN on first load. Server-side actions enforce the
  // real block regardless of whether this banner renders.
  const account = await accountStateForTeacher({ id: user.teacher.id, schoolId: user.teacher.schoolId });

  return (
    <>
      {account.status === "FROZEN" && <FrozenBanner />}
      {children}
    </>
  );
}
