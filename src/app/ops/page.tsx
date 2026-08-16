import { db } from "@/lib/db";

// RED-BUILD DRILL ONLY. This file is a deliberate violation, pushed so that the
// blindness gate can be watched failing in CI before anyone trusts it. It is
// removed in the next commit on this branch.
export default async function OpsPage() {
  const families = await db.parent.findMany({ select: { familyCode: true } });
  return <pre>{JSON.stringify(families)}</pre>;
}
