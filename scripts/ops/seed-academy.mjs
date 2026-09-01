#!/usr/bin/env node
// StoryJar Academy: the fictional school StoryJar staff work and troubleshoot in.
//
// WHY IT IS A REAL SCHOOL
//
// Because a sandbox that is a special case in the code stops resembling the
// thing it is meant to rehearse. If the Academy took a different path through
// the app, the bug you were chasing would live in the path it skipped. So it is
// an ordinary tenant: ordinary teacher accounts, ordinary classes, ordinary
// scoping. School.kind = "DEMO" is not an access control and nothing may read it
// and relax a rule. It exists so FIGURES can exclude it, because several hundred
// children who do not exist must never appear in a pupil roll, a price band or a
// revenue line.
//
// WHY IT CAN PUBLISH TO THE LIBRARY
//
// School.canPublishToLibrary is true here and false everywhere else. It is the
// answer to "author library activities on the same canvas a teacher uses": you
// sign in to an ordinary teacher account, build on the real canvas with real
// uploads, and the promote step is available because of this flag. No operator
// screen needs filesystem access and no rule in the blindness gate is relaxed.
//
// The flag is settable ONLY here and by a migration. No screen writes it.
//
// IDEMPOTENCE
//
// Everything upserts on a natural key: the school on its name, staff on email,
// classes on their code, and children are created only for a class that has
// none. Running it twice changes nothing. Running it after a class has been
// used leaves the work in place.
//
// Usage:  ACADEMY_PASSWORD='…' node scripts/ops/seed-academy.mjs
//
// The password is required and has no default ON PURPOSE. These accounts are
// real sign-ins that StoryJar staff share, so a default in the repository would
// be a published credential for a live school (SAFEGUARDING rule 12). It goes in
// the password manager, and the operator console lists the addresses only.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const SCHOOL_NAME = "StoryJar Academy";
const DOMAIN = "academy.storyjar.co.uk";

// Two forms of entry, nursery through year 6, with the age mode each year group
// actually needs. Nursery and reception are EYFS, years 1 and 2 are KS1, the
// rest are KS2 (see src/lib/ageMode.ts).
const YEAR_GROUPS = [
  { label: "Nursery", ageMode: "EYFS" },
  { label: "Reception", ageMode: "EYFS" },
  { label: "Year 1", ageMode: "KS1" },
  { label: "Year 2", ageMode: "KS1" },
  { label: "Year 3", ageMode: "KS2" },
  { label: "Year 4", ageMode: "KS2" },
  { label: "Year 5", ageMode: "KS2" },
  { label: "Year 6", ageMode: "KS2" },
];
const FORMS = ["Oak", "Elm"];

// First names only, as rule 2 requires of any child record. Fictional, and kept
// deliberately ordinary so a screenshot of the Academy looks like a school.
const NAMES = [
  "Amara", "Ben", "Cleo", "Dev", "Esme", "Femi", "Grace", "Hari", "Iris", "Jonah",
  "Kai", "Lena", "Musa", "Nia", "Otis", "Priya", "Quinn", "Rosa", "Sami", "Tara",
  "Uma", "Vik", "Wren", "Xander", "Yusra", "Zane", "Ada", "Bo", "Cass", "Delia",
];

// Deterministic, readable, and drawn from the same alphabet as a real class code
// (src/lib/classCodeChars.ts excludes I, L, O, 0 and 1 so a child cannot mistype
// them). Deterministic because the script must be able to find the class it made
// last time rather than making a second one.
const codeFor = (yearIndex, formIndex) => `ACD${String(yearIndex + 1).padStart(2, "0")}${formIndex + 1}`;

// 25 to 30 children per class, stable for a given class so a re-run does not
// change the roll.
const rollFor = (yearIndex, formIndex) => 25 + ((yearIndex * FORMS.length + formIndex) % 6);

async function main() {
  const password = process.env.ACADEMY_PASSWORD;
  if (!password) {
    console.error("✖ ACADEMY_PASSWORD is required. These are real shared sign-ins; there is no default.");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash(password, 12);

  let school = await db.school.findFirst({ where: { name: SCHOOL_NAME } });
  if (!school) {
    // `verifiedAt` on creation, not left null. The Academy is where StoryJar
    // staff rehearse the ordinary path, and an unverified school cannot
    // reassign a class, remove an ACTIVE colleague or promote an admin — so a
    // null here would make the sandbox stop resembling the thing it rehearses,
    // which is the one thing this school exists not to do. Seeds run under
    // `db push`, which never applies migrations, so the backfill in
    // 20260902090000_school_claim does not reach a freshly pushed database.
    //
    // Set only on CREATE. The update branch below re-asserts the two flags that
    // are this school's whole point and must not silently re-verify a school
    // somebody deliberately unverified while testing the gates.
    school = await db.school.create({
      data: { name: SCHOOL_NAME, kind: "DEMO", canPublishToLibrary: true, verifiedAt: new Date() },
    });
    console.log(`  created the school`);
  } else {
    // Re-asserted every run: the two flags are the whole point of this school and
    // a hand-edit that quietly cleared one would be invisible until a figure was
    // wrong or publishing stopped working.
    school = await db.school.update({
      where: { id: school.id },
      data: { kind: "DEMO", canPublishToLibrary: true },
    });
    console.log(`  school already existed, flags re-asserted`);
  }

  // The School Manager: the same ADMIN role a real school's business manager
  // has, so ops staff see exactly the controls a customer sees.
  const manager = await db.teacher.upsert({
    where: { email: `manager@${DOMAIN}` },
    create: {
      email: `manager@${DOMAIN}`,
      name: "Academy School Manager",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: school.id,
    },
    update: { passwordHash, role: "ADMIN", status: "ACTIVE", schoolId: school.id },
  });

  let classesMade = 0;
  let childrenMade = 0;

  for (const [yearIndex, year] of YEAR_GROUPS.entries()) {
    for (const [formIndex, form] of FORMS.entries()) {
      const className = `${year.label} ${form}`;
      const email = `${year.label.toLowerCase().replace(/\s+/g, "")}.${form.toLowerCase()}@${DOMAIN}`;

      const teacher = await db.teacher.upsert({
        where: { email },
        create: {
          email,
          name: `${className} teacher`,
          passwordHash,
          role: "TEACHER",
          status: "ACTIVE",
          schoolId: school.id,
        },
        update: { passwordHash, status: "ACTIVE", schoolId: school.id },
      });

      const code = codeFor(yearIndex, formIndex);
      let klass = await db.class.findFirst({ where: { classCode: code } });
      if (!klass) {
        klass = await db.class.create({
          data: {
            name: className,
            classCode: code,
            yearGroup: year.label,
            ageMode: year.ageMode,
            teacherId: teacher.id,
          },
        });
        classesMade += 1;
      } else {
        klass = await db.class.update({
          where: { id: klass.id },
          data: { name: className, yearGroup: year.label, ageMode: year.ageMode, teacherId: teacher.id },
        });
      }

      // Children are added only to a class that has none, so a re-run never
      // doubles a roll and never disturbs work somebody left in the sandbox.
      const existing = await db.student.count({ where: { classId: klass.id } });
      if (existing === 0) {
        const roll = rollFor(yearIndex, formIndex);
        await db.student.createMany({
          data: Array.from({ length: roll }, (_, i) => ({
            name: NAMES[i % NAMES.length],
            classId: klass.id,
          })),
        });
        childrenMade += roll;
      }
    }
  }

  const totalChildren = await db.student.count({ where: { class: { teacher: { schoolId: school.id } } } });

  console.log(`\n✓ ${SCHOOL_NAME} ready.`);
  console.log(`  ${YEAR_GROUPS.length * FORMS.length} classes (${classesMade} new), ${totalChildren} children (${childrenMade} new).`);
  console.log(`  School Manager: ${manager.email}`);
  console.log(`  Class teachers: <yeargroup>.<form>@${DOMAIN}, e.g. year3.oak@${DOMAIN}`);
  console.log(`  Passwords are NOT printed and NOT in the repository. They live in the password manager.`);
  console.log(`  This school is kind=DEMO: it must never appear in a pupil roll, price band or revenue figure.`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(`✖ Academy seed failed: ${e.message}`);
  await db.$disconnect();
  process.exit(1);
});
