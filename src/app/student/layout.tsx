import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ClientErrorReporter } from "@/components/ClientErrorReporter";

// Guard: everything under /student requires a signed-in student.
//
// The reporter sits here rather than in the root layout so a change to it runs
// the product suites, not the operator ones (scripts/select-suites.mjs); it
// covers every child surface, the canvas included. The boundary itself is
// error.tsx beside this file; it wraps the children, not the layout.
export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login/student");
  if (user.role !== "STUDENT") redirect("/teacher");

  return (
    <>
      <ClientErrorReporter />
      {children}
    </>
  );
}
