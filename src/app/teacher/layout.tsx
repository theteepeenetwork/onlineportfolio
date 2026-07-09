import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// Guard: everything under /teacher requires a signed-in teacher.
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/teacher");
  if (user.role !== "TEACHER") redirect("/student");

  return <>{children}</>;
}
