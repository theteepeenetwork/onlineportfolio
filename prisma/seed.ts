import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Cheerful placeholder "drawings" for template pages and demo responses.
const SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="200" cy="150" r="55" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="8" stroke-linecap="round"><line x1="200" y1="55" x2="200" y2="20"/><line x1="200" y1="245" x2="200" y2="280"/><line x1="105" y1="150" x2="70" y2="150"/><line x1="295" y1="150" x2="330" y2="150"/><line x1="132" y1="82" x2="108" y2="58"/><line x1="268" y1="218" x2="292" y2="242"/><line x1="268" y1="82" x2="292" y2="58"/><line x1="132" y1="218" x2="108" y2="242"/></g></svg>`;
const HOUSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><rect x="130" y="150" width="140" height="110" fill="#93c5fd"/><polygon points="120,150 200,90 280,150" fill="#ef4444"/><rect x="185" y="200" width="30" height="60" fill="#7c3aed"/><rect x="150" y="170" width="30" height="30" fill="#fde047"/><rect x="220" y="170" width="30" height="30" fill="#fde047"/></svg>`;
const BUG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><ellipse cx="200" cy="160" rx="90" ry="70" fill="#ef4444"/><line x1="200" y1="92" x2="200" y2="230" stroke="#1f2430" stroke-width="6"/><circle cx="200" cy="96" r="26" fill="#1f2430"/><circle cx="160" cy="140" r="12" fill="#1f2430"/><circle cx="240" cy="140" r="12" fill="#1f2430"/><circle cx="160" cy="190" r="12" fill="#1f2430"/><circle cx="240" cy="190" r="12" fill="#1f2430"/></svg>`;

function writeSvg(name: string, svg: string) {
  writeFileSync(path.join(process.cwd(), "public", "uploads", name), svg);
  return `/uploads/${name}`;
}

async function main() {
  // Start clean so re-seeding is safe (order respects foreign keys).
  await db.session.deleteMany();
  await db.journalItem.deleteMany();
  await db.assignmentStudent.deleteMany();
  await db.assignment.deleteMany();
  await db.activityTemplate.deleteMany();
  await db.parent.deleteMany(); // magic tokens + parent↔child links cascade
  await db.student.deleteMany();
  await db.class.deleteMany();
  await db.teacher.deleteMany();
  await db.school.deleteMany();
  await db.skill.deleteMany();

  // The demo teacher is also the admin of their school, so the /admin space is
  // reachable from the seeded login.
  const school = await db.school.create({
    data: { name: "St Bede’s Primary", plan: "Annual plan", seatLimit: 10 },
  });

  const teacher = await db.teacher.create({
    data: {
      name: "Sam Rivera",
      title: "",
      displayStyle: "first",
      displayName: "Sam",
      email: "teacher@school.uk",
      passwordHash: await bcrypt.hash("password", 10),
      role: "ADMIN",
      status: "ACTIVE",
      schoolId: school.id,
    },
  });

  // A few colleagues so the staff table has content: two active teachers (each
  // owning a class), a teaching assistant, and one invite still pending.
  const malik = await db.teacher.create({
    data: { name: "Miss Malik", displayName: "Miss Malik", email: "a.malik@stbedes.sch.uk", passwordHash: await bcrypt.hash("password", 10), role: "TEACHER", status: "ACTIVE", schoolId: school.id },
  });
  await db.teacher.create({
    data: { name: "Sam Doyle", displayName: "Sam", email: "s.doyle@stbedes.sch.uk", passwordHash: await bcrypt.hash("password", 10), role: "TA", status: "ACTIVE", schoolId: school.id },
  });
  await db.teacher.create({
    data: { name: "J. Reed", displayName: "J", email: "j.reed@stbedes.sch.uk", passwordHash: "", role: "TEACHER", status: "INVITED", schoolId: school.id },
  });
  // Miss Malik teaches her own class (so admins can see class ownership).
  await db.class.create({
    data: { name: "Butterflies", yearGroup: "Reception", classCode: "BTF789", teacherId: malik.id },
  });

  const sunflower = await db.class.create({
    data: { name: "Sunflower Class", classCode: "SUN123", teacherId: teacher.id },
  });
  const ladybird = await db.class.create({
    data: { name: "Ladybird Class", classCode: "LDB456", teacherId: teacher.id },
  });

  const colors = ["#ef4444", "#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];
  const sun = await Promise.all(
    ["Amara", "Ben", "Chloe", "Dev", "Ella", "Finn"].map((name, i) =>
      db.student.create({ data: { name, classId: sunflower.id, avatarColor: colors[i % colors.length] } }),
    ),
  );
  const lady = await Promise.all(
    ["Grace", "Harry", "Isla"].map((name, i) =>
      db.student.create({ data: { name, classId: ladybird.id, avatarColor: colors[(i + 3) % colors.length] } }),
    ),
  );

  const skills = await Promise.all(
    ["Number bonds to 10", "Phonics: digraphs", "Explaining reasoning", "Fine motor / handwriting", "Speaking & listening"].map(
      (name) => db.skill.create({ data: { name } }),
    ),
  );

  const sunPath = writeSvg("seed-sun.svg", SUN);
  const housePath = writeSvg("seed-house.svg", HOUSE);
  const bugPath = writeSvg("seed-bug.svg", BUG);

  const response = (data: {
    studentId: string;
    classId: string;
    assignmentId: string;
    status: string;
    type?: string;
    caption?: string;
    text?: string;
    media?: string;
    skillIds?: string[];
  }) =>
    db.journalItem.create({
      data: {
        type: data.type ?? "DRAWING",
        caption: data.caption ?? null,
        textContent: data.text ?? null,
        mediaPath: data.media ?? null,
        status: data.status,
        approvedAt: data.status === "APPROVED" ? new Date() : null,
        authorRole: "STUDENT",
        studentId: data.studentId,
        classId: data.classId,
        assignmentId: data.assignmentId,
        skills: data.skillIds?.length ? { connect: data.skillIds.map((id) => ({ id })) } : undefined,
      },
    });

  // --- Library folders (for organising templates) ---
  const mathsFolder = await db.folder.create({ data: { name: "Maths & number", color: "#8AB9D6", teacherId: teacher.id } });
  const outdoorsFolder = await db.folder.create({ data: { name: "Autumn term", color: "#F0B441", teacherId: teacher.id } });
  await db.folder.create({ data: { name: "Phonics & words", color: "#E08A9B", teacherId: teacher.id } });

  // --- Template 1: Count the apples (Maths) — a live run with waiting work ---
  const apples = await db.activityTemplate.create({
    data: {
      title: "Count the apples",
      instructions: "Circle how many apples you can count.",
      templatePathsJson: JSON.stringify([sunPath]),
      tagsJson: JSON.stringify(["Maths"]),
      folderId: mathsFolder.id,
      teacherId: teacher.id,
    },
  });
  const applesRun = await db.assignment.create({
    data: {
      templateId: apples.id,
      classId: sunflower.id,
      wholeClass: true,
      status: "LIVE",
      title: apples.title,
      instructions: apples.instructions,
      templateSnapshotJson: apples.templatePathsJson,
    },
  });
  await response({ studentId: sun[0].id, classId: sunflower.id, assignmentId: applesRun.id, status: "APPROVED", caption: "3 apples", media: sunPath, skillIds: [skills[0].id] });
  await response({ studentId: sun[1].id, classId: sunflower.id, assignmentId: applesRun.id, status: "PENDING", caption: "I count 4", media: sunPath });
  await response({ studentId: sun[2].id, classId: sunflower.id, assignmentId: applesRun.id, status: "PENDING", type: "TEXT", text: "There are 5 apples" });

  // --- Template 2: Minibeast hunt (Science, Outdoors) — several runs ---
  const minibeast = await db.activityTemplate.create({
    data: {
      title: "Minibeast hunt",
      instructions: "Draw the minibeasts you found outside.",
      templatePathsJson: JSON.stringify([bugPath, housePath]),
      tagsJson: JSON.stringify(["Science", "Outdoors"]),
      folderId: outdoorsFolder.id,
      teacherId: teacher.id,
    },
  });
  const mbRun = await db.assignment.create({
    data: {
      templateId: minibeast.id,
      classId: sunflower.id,
      wholeClass: true,
      status: "LIVE",
      title: minibeast.title,
      instructions: minibeast.instructions,
      templateSnapshotJson: minibeast.templatePathsJson,
    },
  });
  // Keep the pending responses on Ben & Chloe so the demo has "waiting" work
  // without cluttering the children used by the automated tests.
  for (const st of [sun[1], sun[2]]) {
    await response({ studentId: st.id, classId: sunflower.id, assignmentId: mbRun.id, status: "PENDING", caption: "A ladybird", media: bugPath });
  }
  // Live run to chosen Ladybird children.
  await db.assignment.create({
    data: {
      templateId: minibeast.id,
      classId: ladybird.id,
      wholeClass: false,
      status: "LIVE",
      title: minibeast.title,
      instructions: minibeast.instructions,
      templateSnapshotJson: minibeast.templatePathsJson,
      students: { create: [{ studentId: lady[0].id }, { studentId: lady[1].id }] },
    },
  });
  // A closed run from earlier in the year — kept forever as evidence.
  const closed = await db.assignment.create({
    data: {
      templateId: minibeast.id,
      classId: sunflower.id,
      wholeClass: true,
      status: "CLOSED",
      title: minibeast.title,
      instructions: minibeast.instructions,
      templateSnapshotJson: minibeast.templatePathsJson,
      createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000),
    },
  });
  await response({ studentId: sun[0].id, classId: sunflower.id, assignmentId: closed.id, status: "APPROVED", caption: "A snail", media: bugPath });

  // --- Dated runs with due dates, so the calendar shows due-soon / overdue /
  //     complete states across the current month. ---
  const days = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

  // Due in 2 days, partly done → "due soon" + partial completion.
  const dueSoonRun = await db.assignment.create({
    data: {
      templateId: apples.id, classId: sunflower.id, wholeClass: true, status: "LIVE",
      title: apples.title, instructions: apples.instructions, templateSnapshotJson: apples.templatePathsJson,
      createdAt: days(-2), dueDate: days(2),
    },
  });
  // Ben & Chloe already carry seeded work, so responses here don't disturb the
  // "clean" children (Dev/Ella/Finn) the canvas specs rely on, nor the demo
  // parent's children (Amara/Grace).
  await response({ studentId: sun[1].id, classId: sunflower.id, assignmentId: dueSoonRun.id, status: "APPROVED", caption: "6 apples", media: sunPath });
  await response({ studentId: sun[2].id, classId: sunflower.id, assignmentId: dueSoonRun.id, status: "PENDING", caption: "lots!", media: sunPath });

  // Due yesterday, still incomplete, LIVE → "overdue".
  const overdueRun = await db.assignment.create({
    data: {
      templateId: minibeast.id, classId: sunflower.id, wholeClass: true, status: "LIVE",
      title: minibeast.title, instructions: minibeast.instructions, templateSnapshotJson: minibeast.templatePathsJson,
      createdAt: days(-6), dueDate: days(-1),
    },
  });
  await response({ studentId: sun[1].id, classId: sunflower.id, assignmentId: overdueRun.id, status: "APPROVED", caption: "A beetle", media: bugPath });

  // No due date, everyone's in the jar → "complete", plots on its assigned day.
  const completeRun = await db.assignment.create({
    data: {
      templateId: minibeast.id, classId: ladybird.id, wholeClass: false, status: "LIVE",
      title: minibeast.title, instructions: minibeast.instructions, templateSnapshotJson: minibeast.templatePathsJson,
      createdAt: days(-3),
      students: { create: [{ studentId: lady[1].id }, { studentId: lady[2].id }] },
    },
  });
  await response({ studentId: lady[1].id, classId: ladybird.id, assignmentId: completeRun.id, status: "APPROVED", caption: "A worm", media: bugPath });
  await response({ studentId: lady[2].id, classId: ladybird.id, assignmentId: completeRun.id, status: "APPROVED", caption: "A ladybird", media: bugPath });

  // --- Template 3: Draw your family (Writing) — never run ---
  await db.activityTemplate.create({
    data: {
      title: "Draw your family",
      instructions: "Draw everyone in your family and label them.",
      tagsJson: JSON.stringify(["Writing"]),
      teacherId: teacher.id,
    },
  });

  // A free (non-activity) journal item so the journal has variety.
  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "My sunshine picture",
      mediaPath: sunPath,
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: sun[0].id,
      classId: sunflower.id,
      skills: { connect: [{ id: skills[3].id }] },
    },
  });

  // An approved moment for Grace (Ladybird) so a parent with two children has
  // content under both tabs of the sibling switcher.
  await db.journalItem.create({
    data: {
      type: "PHOTO",
      caption: "My junk-model rocket",
      mediaPath: housePath,
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: lady[0].id,
      classId: ladybird.id,
    },
  });

  // A parent/carer linked to two children (Amara in Sunflower, Grace in
  // Ladybird) — demonstrates the read-only family view + sibling switcher.
  // Signs in with family code FAM123 or a magic link to parent@home.com.
  await db.parent.create({
    data: {
      name: "Priya Shah",
      email: "parent@home.com",
      familyCode: "FAM123",
      children: { connect: [{ id: sun[0].id }, { id: lady[0].id }] },
    },
  });

  console.log("✅ Seeded demo data (library-first activities).");
  console.log("   Teacher: teacher@school.uk / password");
  console.log("   Class codes: SUN123 (Sunflower), LDB456 (Ladybird)");
  console.log("   Parent: family code FAM123 / magic link parent@home.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
