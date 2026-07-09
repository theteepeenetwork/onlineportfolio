import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// Guard: everything under /student requires a signed-in student.
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/student");
  if (user.role !== "STUDENT") redirect("/teacher");

  return <>{children}</>;
}
