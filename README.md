# Class Journal

A digital portfolio and journal for a primary class — a first, working slice of
a Seesaw-style platform. Every child has their own journal. They add work as a
**photo**, in their **own words**, or as a **drawing**, and nothing appears in
their journal until you (the teacher) approve it.

This is **Milestone 1: the journal spine**. Voice/video recording, assignable
activities, and the side-by-side "30 responses on one screen" view are planned
next (see [Roadmap](#roadmap-whats-next)).

---

## What it does today

- **Teacher accounts**: create an account (name, email, password, and an
  optional first class), then **sign in** with email and password.
- **Multiple classes**: a teacher can create as many classes as they like, each
  with its own auto-generated class code and roster.
- **Student sign-in** with a short class code, then tapping their own name — no
  passwords or emails for children (safe for early years / KS1).
- A **class roster** you manage: add and remove children, and see the class code
  to share with them.
- Children **add to their journal** with:
  - 📷 a **photo** — taken live with the **device camera** or **uploaded** from a
    file (with an optional caption),
  - ✏️ their **own words** (typed),
  - 🎨 a **drawing** on a **full-screen, child-led canvas** (Seesaw-style):
    realistic tools that rise from the bottom edge (pencil, pen, marker,
    eraser) with the selected one lifted, **text boxes** (which can be
    re-selected, moved and re-edited), a **rainbow colour
    slider** + palette, brush sizes, **undo/redo**, and **multiple pages** with
    a live thumbnail filmstrip. A ＋ button adds a photo, PDF, or **shape**
    (rectangle, circle, triangle, star, speech bubble) onto the canvas as a
    **movable, resizable object** — pick the **cursor tool** to select, drag to
    move, pull the corner to resize, ✕ to remove. Shapes also have editable
    **fill and line colours**, and you can **double-tap a shape to add a label
    locked inside it** — the label wraps and auto-sizes to fit the shape's actual
    area (so it stays inside triangles, circles, stars, etc.), reflowing into new
    lines as you move or resize the shape. With any drawing tool selected, pen
    strokes go
    **on top of**
    shapes and pictures, so you can write over anything.
- **Activities** you set for the class:
  - Build a task with a **title, instructions, and an optional template** — draw
    the template on the canvas and/or **upload a PDF or picture** (a worksheet)
    that children work directly on top of.
  - **Assign to the whole class or to chosen children.**
  - Children see their activities, respond on the template, and hand in to your
    approval queue.
  - See **everyone's responses side by side** on one screen — the fast
    "who's got it" formative-assessment view.
- An **approval queue**: every child's submission waits for you. You **approve &
  publish** it (tagging it against skills as you go) or **send it back** with a
  note asking for another go.
- A per-child **journal timeline** that builds up over the year as an evidence
  base — each item stamped with the date and any skills you tagged.
- Teachers can also **add work on a child's behalf** (this publishes straight
  away, no approval needed).

---

## Running it on your computer

You need **Node.js** installed (version 20 or newer). Then open a terminal in
this folder and run these three commands, once, in order:

```bash
npm install       # download everything the app needs
npm run setup     # create the database and add a demo class
npm run dev       # start the app
```

Then open **http://localhost:3000** in your web browser.

To stop the app, click the terminal and press `Ctrl + C`. To start it again
another day, you only need `npm run dev`.

### Try it with the demo class

`npm run setup` creates a demo class so you can click around immediately:

| Role        | How to sign in                                          |
| ----------- | ------------------------------------------------------- |
| **Teacher** | Email `teacher@school.uk` · Password `password`         |
| **Student** | Choose "I'm a student", class code `SUN123`, tap a name |

A good way to see the whole idea in two minutes:

1. Sign in as a **student**, add a drawing or a few words to your journal.
2. Sign out, sign in as the **teacher**, and you'll see it waiting under
   **Approvals**. Approve it.
3. Open that child's journal — your approved work is now there.

### Starting fresh

To wipe everything and rebuild the demo class from scratch:

```bash
npm run db:reset
```

### Checking it works

Run the automated end-to-end tests (they drive a real browser through the app):

```bash
npm test
```

See [TESTING.md](TESTING.md) for details and a manual smoke-test checklist.

---

## How it's built (for anyone curious or helping you)

- **Next.js 16** (React) with **TypeScript** — one app for both the pages and
  the behind-the-scenes logic.
- **SQLite** database via **Prisma** — a single file (`prisma/dev.db`) on your
  computer, so there's no separate database to install or run.
- Photos and drawings are saved into `public/uploads/` on your computer.
- Styling with **Tailwind CSS**.

Key places in the code:

| Where                  | What it is                                        |
| ---------------------- | ------------------------------------------------- |
| `prisma/schema.prisma` | The data model (teachers, students, journal, …)   |
| `prisma/seed.ts`       | The demo class that `npm run setup` creates       |
| `src/app/`             | The pages (teacher area, student area, sign-in)   |
| `src/app/actions/`     | The actions that save data (login, submit, …)     |
| `src/components/`      | Reusable pieces (drawing canvas, journal card, …) |
| `src/lib/`             | Database, sign-in sessions, and file saving       |

---

## Roadmap: what's next

The next milestones, in a sensible order to build them:

1. **Voice & video** recording as response types (the most important addition
   for pre-readers — record a child explaining their thinking), including
   **recorded voice instructions** on activities.
2. **Groups** and tagging work to a group as well as individuals.
3. **Families** — a read-only home view so parents can see published work.
4. **Scheduling & a reusable activity library** to save tasks for next year.

Already built: the journal spine, the multi-tool multi-page canvas with text
boxes, camera/upload photos, and **activities with canvas/PDF templates,
whole-class or per-child assignment, and the side-by-side responses view**.

---

## Notes on safety & privacy

This first version runs entirely on your own computer and stores everything
locally — nothing is sent anywhere. Before using it with real children's work,
it would need proper hosting, secure teacher passwords, and a privacy review;
those come with the later milestones.
