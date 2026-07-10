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
  await db.student.deleteMany();
  await db.class.deleteMany();
  await db.teacher.deleteMany();
  await db.skill.deleteMany();

  const teacher = await db.teacher.create({
    data: {
      name: "Sam Rivera",
      email: "teacher@school.uk",
      passwordHash: await bcrypt.hash("password", 10),
    },
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

  // --- Template 1: Count the apples (Maths) — a live run with waiting work ---
  const apples = await db.activityTemplate.create({
    data: {
      title: "Count the apples",
      instructions: "Circle how many apples you can count.",
      templatePathsJson: JSON.stringify([sunPath]),
      tagsJson: JSON.stringify(["Maths"]),
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

  console.log("✅ Seeded demo data (library-first activities).");
  console.log("   Teacher: teacher@school.uk / password");
  console.log("   Class codes: SUN123 (Sunflower), LDB456 (Ladybird)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
