import { redirect } from "next/navigation";

// Billing moved into the Account settings page. Redirect any old links (and
// in-flight Stripe return URLs) to /teacher/account, preserving query params.
export default async function BillingRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string") qs.set(k, v);
  }
  const suffix = qs.toString();
  redirect(`/teacher/account${suffix ? `?${suffix}` : ""}`);
}
