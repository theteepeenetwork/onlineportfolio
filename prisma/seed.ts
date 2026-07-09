import "dotenv/config";
import { writeFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Two cheerful placeholder "drawings" so the demo journal isn't empty.
const SUN = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><circle cx="200" cy="150" r="55" fill="#f59e0b"/><g stroke="#f59e0b" stroke-width="8" stroke-linecap="round"><line x1="200" y1="55" x2="200" y2="20"/><line x1="200" y1="245" x2="200" y2="280"/><line x1="105" y1="150" x2="70" y2="150"/><line x1="295" y1="150" x2="330" y2="150"/><line x1="132" y1="82" x2="108" y2="58"/><line x1="268" y1="218" x2="292" y2="242"/><line x1="268" y1="82" x2="292" y2="58"/><line x1="132" y1="218" x2="108" y2="242"/></g></svg>`;
const HOUSE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#fff"/><rect x="130" y="150" width="140" height="110" fill="#93c5fd"/><polygon points="120,150 200,90 280,150" fill="#ef4444"/><rect x="185" y="200" width="30" height="60" fill="#7c3aed"/><rect x="150" y="170" width="30" height="30" fill="#fde047"/><rect x="220" y="170" width="30" height="30" fill="#fde047"/></svg>`;

function writeDrawing(name: string, svg: string) {
  writeFileSync(path.join(process.cwd(), "public", "uploads", name), svg);
  return `/uploads/${name}`;
}

async function main() {
  // Start clean so re-seeding is safe.
  await db.session.deleteMany();
  await db.journalItem.deleteMany();
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

  const klass = await db.class.create({
    data: { name: "Sunflower Class", classCode: "SUN123", teacherId: teacher.id },
  });

  const colors = [
    "#ef4444", "#f97316", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899",
  ];
  const names = ["Amara", "Ben", "Chloe", "Dev", "Ella", "Finn"];
  const students = await Promise.all(
    names.map((name, i) =>
      db.student.create({
        data: { name, classId: klass.id, avatarColor: colors[i] },
      }),
    ),
  );

  const skillNames = [
    "Number bonds to 10",
    "Phonics: digraphs",
    "Explaining reasoning",
    "Fine motor / handwriting",
    "Speaking & listening",
  ];
  const skills = await Promise.all(
    skillNames.map((name) => db.skill.create({ data: { name } })),
  );

  const sunPath = writeDrawing("seed-sun.svg", SUN);
  const housePath = writeDrawing("seed-house.svg", HOUSE);

  // A few example journal items spread across the approval states.
  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "My sunshine picture",
      mediaPath: sunPath,
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: students[0].id,
      classId: klass.id,
      skills: { connect: [{ id: skills[3].id }] },
    },
  });

  await db.journalItem.create({
    data: {
      type: "TEXT",
      textContent: "I made 10 with 6 and 4. Then I found 7 and 3 also makes 10!",
      status: "APPROVED",
      approvedAt: new Date(),
      authorRole: "STUDENT",
      studentId: students[0].id,
      classId: klass.id,
      skills: { connect: [{ id: skills[0].id }, { id: skills[2].id }] },
    },
  });

  await db.journalItem.create({
    data: {
      type: "DRAWING",
      caption: "The house I read about",
      mediaPath: housePath,
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: students[1].id,
      classId: klass.id,
    },
  });

  await db.journalItem.create({
    data: {
      type: "TEXT",
      textContent: "sh ch th — I can hear the sounds!",
      status: "PENDING",
      authorRole: "STUDENT",
      studentId: students[2].id,
      classId: klass.id,
    },
  });

  console.log("✅ Seeded demo data.");
  console.log("   Teacher login: teacher@school.uk / password");
  console.log("   Student class code: SUN123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
