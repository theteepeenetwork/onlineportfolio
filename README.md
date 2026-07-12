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
- A **class roster** you manage: add children one at a time **or paste a whole
  class list at once** (one name per line, straight from a register or
  spreadsheet), remove children, and see the class code to share with them.
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
- An **activity library** (library-first):
  - Build **reusable templates** — a title, instructions, tags, and an optional
    template you **draw on the canvas** and/or **upload as a PDF or picture** (a
    worksheet) that children work directly on top of.
  - **Assign** a template to a class as a **run** — whole class or chosen
    children — and **reassign** it to another class or next year; each run is
    independent and past responses are kept forever.
  - The library shows each template's live status, a **"needs attention"** strip
    for runs with work waiting, and tag/status filters.
  - A **template detail** page lists every run with progress, and a per-run
    **response grid** showing every child at a glance (done / waiting / not yet).
  - Children see their assigned runs, respond on the template, and hand in to
    your approval queue.
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

## Billing (Stripe)

Storyjar charges for subscriptions through **Stripe**. Card details never touch
our servers: buying happens on Stripe's hosted **Checkout**, plan changes on the
Stripe **Customer Portal**, and we store only Stripe IDs. Apple Pay and Google
Pay appear automatically in Checkout (enable them in the Stripe dashboard) — no
extra code and no Stripe.js on any page. **No child data is ever sent to Stripe.**

Plans (GBP, VAT-inclusive):

- **Individual** — £3.99/month or £40/year (a teacher pays personally).
- **School** — £40 per teacher/year, seat-based; card or invoice/PO (BACS).
- **Trial** — every account gets 42 days free from signup (no card), tracked
  locally; a Stripe subscription is created only at first payment.

Account states (`Subscription.status`): `TRIAL`, `ACTIVE`, `PAST_DUE` all have
full access; `FROZEN` is read-only (view/download/export only). The single
server-side gate `requireWritableAccount()` (`src/lib/billing.ts`) enforces this
on every mutating action.

### One-time Stripe setup (test mode)

1. Set `STRIPE_SECRET_KEY` in `.env` (see `.env.example`).

2. Create the three prices with the [Stripe CLI](https://stripe.com/docs/stripe-cli)
   and copy each returned `price_…` id into `.env`:

   ```bash
   # Individual — £3.99 / month  → STRIPE_PRICE_INDIVIDUAL_MONTHLY
   stripe prices create --currency=gbp --unit-amount=399 \
     -d "recurring[interval]=month" \
     -d "product_data[name]=Storyjar Individual (monthly)"

   # Individual — £40 / year  → STRIPE_PRICE_INDIVIDUAL_ANNUAL
   stripe prices create --currency=gbp --unit-amount=4000 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar Individual (annual)"

   # School — £40 / seat / year (quantity = seats)  → STRIPE_PRICE_SCHOOL_SEAT_ANNUAL
   stripe prices create --currency=gbp --unit-amount=4000 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar School seat (annual)"
   ```

3. Forward webhooks to the dev server and copy the printed `whsec_…` into
   `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

4. Drive state transitions with test events:

   ```bash
   stripe trigger checkout.session.completed
   stripe trigger invoice.payment_failed
   stripe trigger customer.subscription.deleted
   ```

5. **Apple Pay:** register the production domain in the Stripe dashboard
   (Payment methods → Apple Pay), then put the association file contents in
   `STRIPE_APPLE_PAY_DOMAIN_ASSOCIATION`. It is served at
   `/.well-known/apple-developer-merchantid-domain-association`.

The daily **trial-expiry freeze** job (`npm run billing:freeze`) freezes accounts
whose trial lapsed without a subscription; the same freeze also happens lazily on
the next request.

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
