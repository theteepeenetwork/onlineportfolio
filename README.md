# Class Journal

A digital portfolio and journal for a primary class — a first, working slice of
a Seesaw-style platform. Every child has their own journal. They add work as a
**photo**, a **voice note**, in their **own words**, or as a **drawing**, and
nothing appears in their journal until you (the teacher) approve it.

This is **Milestone 1: the journal spine**. Voice recording is now built (the
top pre-launch priority for the EYFS/pre-reader market); video recording,
assignable activities, and the side-by-side "30 responses on one screen" view
are planned next (see [Roadmap](#roadmap-whats-next)).

---

## What it does today

- **Teacher accounts**: create an account (name, email, password, and an
  optional first class), then **sign in** with email and password.
- **Multiple classes**: a teacher can create as many classes as they like, each
  with its own auto-generated class code and roster.
- **Student sign-in** with a short class code, then tapping their own name — no
  passwords or emails for children (safe from early years through KS2).
- A **class roster** you manage: add children one at a time **or paste a whole
  class list at once** (one name per line, straight from a register or
  spreadsheet), remove children, and see the class code to share with them.
- Children **add to their journal** with:
  - 📷 a **photo** — taken live with the **device camera** or **uploaded** from a
    file (with an optional caption),
  - 🎙️ a **voice note** — a short recording made with the **device microphone**
    (record / stop / play back / record again, with an optional caption), the
    same one-tap, child-led simplicity as the rest of the capture flow,
  - ✏️ their **own words** (typed),
  - 🎨 a **drawing** on a **full-screen, child-led canvas** (Seesaw-style):
    realistic tools that rise from the bottom edge (pencil, pen, marker,
    eraser) with the selected one lifted, **text boxes** (which can be
    re-selected, moved and re-edited), a **rainbow colour
    slider** + palette, brush sizes, **undo/redo**, and **multiple pages** with
    a live thumbnail filmstrip. A ＋ button adds a photo, PDF, or a **shape** from
    a **toolbox kit** onto the canvas as a **movable, resizable object** — pick
    the **cursor tool** to select, drag to move, pull the corner to resize, ✕ to
    remove, **＋1** to make another one, and a **rotate handle** that turns a
    shape freely, all the way round. Dragged shapes **snap to a light grid**, so
    a row of apparatus lines up without a child having to aim. Children get one
    palette at every age — rectangle, circle, triangle, star, speech bubble,
    line, arrow and ring. Shapes also have editable
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
  - A **Maths kit** on the template canvas — number lines, arrows, jump arrows
    and braces; **base 10** ones, ten rods, hundred flats and thousand cubes;
    **place-value counters** labelled 1, 10, 100 and 1000; **ten frames**,
    hundred squares and arrays; **fraction bars, circles and rings**; and a
    **clock face** whose numbers you can print or leave for a child to write on.
    Shapes built from a number carry a **stepper**, so any denominator up to 24
    is a tap away rather than a release away, and a ring's **band thickness** is
    the ring's own.
  - Mark any piece of apparatus **endless**, and a child drags a new one off it
    while the original stays put — so they build twenty-four out of tens and
    ones without ever opening a toolbox. The kit is the teacher's tool for
    *building* the worksheet; what a child needs arrives **on** it.
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
| **Student** | Choose "I'm a student", class code `SUN234`, tap a name |

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

There is also a team of **user testers** — a platform operator, teachers, a
school business manager, a parent, a child in each age group and a bot — who use
the app the way real people do and write down anything confusing, awkward or
broken:

```bash
npm run test:personas
```

What they found last time is in [USER_TESTING.md](USER_TESTING.md).

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

- **Teacher** — **free, permanently**. One teacher, *all* of their own classes,
  every feature. No card and no trial clock, so nothing ever expires mid-term.
  A free plan never reaches Stripe at all.
- **School** — **£199–£649/year, banded by pupils on roll** (£199 up to 105 ·
  £299 up to 210 · £449 up to 420 · £649 over 420). Every feature is in every
  band; the band is set once at purchase and fixed for the year, so growing
  mid-year costs nothing extra. No seats and no per-pupil metering. Card or
  invoice/PO (BACS).
- **VAT** — Storyjar is **not VAT registered**, so prices are the price. Do not
  add "+ VAT" anywhere: `VAT_REGISTERED` in `src/lib/billing-plans.ts` is the one
  switch to flip if that changes.
- **Trial** — 42 days, and only for a **school** evaluating the plan before a PO
  is raised. Tracked locally; a Stripe subscription is created at first payment.

The retired Individual plan (£3.99/mo, £40/yr) and the old per-seat school price
are gone — see [`docs/pricing-decisions.md`](docs/pricing-decisions.md) for why.

Account states (`Subscription.status`): `TRIAL`, `ACTIVE`, `PAST_DUE` all have
full access; `FROZEN` is read-only (view/download/export only). The single
server-side gate `requireWritableAccount()` (`src/lib/billing.ts`) enforces this
on every mutating action.

A **free teacher plan is `ACTIVE` with no `trialEndsAt`, so it has nothing to
lapse** — there is no route from a free account to `FROZEN`. Only a school plan
can be on trial and only a school plan can freeze, which means children's work in
a free account is never on a billing deletion clock.

### One-time Stripe setup (test mode)

1. Set `STRIPE_SECRET_KEY` in `.env` (see `.env.example`).

2. Create the four band prices with the [Stripe CLI](https://stripe.com/docs/stripe-cli)
   and copy each returned `price_…` id into `.env`:

   ```bash
   # Up to 105 pupils — £199 / year  → STRIPE_PRICE_SCHOOL_SMALL
   stripe prices create --currency=gbp --unit-amount=19900 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar School — up to 105 pupils"

   # Up to 210 pupils — £299 / year  → STRIPE_PRICE_SCHOOL_1FE
   stripe prices create --currency=gbp --unit-amount=29900 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar School — up to 210 pupils"

   # Up to 420 pupils — £449 / year  → STRIPE_PRICE_SCHOOL_2FE
   stripe prices create --currency=gbp --unit-amount=44900 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar School — up to 420 pupils"

   # Over 420 pupils — £649 / year  → STRIPE_PRICE_SCHOOL_LARGE
   stripe prices create --currency=gbp --unit-amount=64900 \
     -d "recurring[interval]=year" \
     -d "product_data[name]=Storyjar School — over 420 pupils"
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

## Transactional email (Mailjet)

Storyjar sends exactly one email today: the **sign-in link a parent asks for**.
It goes through [Mailjet](https://www.mailjet.com) (Sinch) over its Send API
v3.1. No SDK, no mail library, just a `fetch` (`src/lib/mailer.ts`). Mailjet
stores in the EU only.

It went through Brevo until August 2026. The `WHY NOT BREVO` comment at the top
of `src/lib/mailer.ts` records why it does not any more, and that comment is the
reason nobody reinstates it in six months. Read it before evaluating any
replacement provider: the disqualifying behaviour was link rewriting, not
tracking as such.

Four rules hold this together, and each one is load-bearing:

- **No child's name and no child content ever appears in an email.** The school
  holds the parent's address, not us, and addresses get mistyped. Every template
  in `src/lib/emailTemplates.ts` is written so a misdirected message tells a
  stranger nothing about any child.
- **We cannot tell whether a particular parent opened an email, or clicked its
  link.** Tracking is off three ways: Mailjet's account-level *Track openers*
  and *Track clicks* are both switched off, which covers transactional mail and
  not campaigns alone, and every send disables both again per message
  (`TrackOpens` / `TrackClicks`, plus the `X-MJ-TrackOpen` / `X-MJ-TrackClick`
  headers). Three switches is not three times the confidence. Brevo ignored the
  one flag its API accepted, so treat all three as claims about configuration
  and check the behaviour: `npx tsx scripts/verify-mail.ts <a mailbox you
  control>` sends the real sign-in template with a fake token and tells you what
  to look for in the delivered raw source, and `node scripts/mail-events.mjs`
  shows what the provider actually recorded. Click-tracking in particular must
  never happen, because rewriting the sign-in link would break the token and
  hand a third party the means to use it.
- **The templates themselves contain no image, no external URL and no
  stylesheet**, so "no tracking pixel" is a property of the message rather than
  a promise about a provider's settings. That is a blocking test
  (`tests/battery/security/email-templates.spec.ts`), not a comment. It is why
  `src/lib/emailTemplates.ts` has no `server-only` import, and its header
  records what would put that guard back.
- **Mailjet holds a delivery record for 90 days** on the free plan (13 months
  on paid plans, so an upgrade lengthens it). That is longer than the 1 month
  the previous provider allowed, and it was accepted deliberately: see the email
  row in [`RETENTION.md`](./RETENTION.md), which also records what Mailjet's
  documentation does **not** say about message-level data. Do not quote a
  tighter figure than that row does.
- **The link is never returned to the browser in production.** See
  `src/lib/signInLinkPolicy.ts` and FINDINGS **F19**; development keeps the
  on-screen link because local work has no mail server.

Setup: create a Mailjet account, add and validate the **sending subdomain**
`mail.storyjar.co.uk` with SPF and DKIM (not the root domain, so outbound
authentication mail never shares reputation with inbound forwarding), switch
*Track openers* and *Track clicks* off at account level, then set
`MAILJET_API_KEY`, `MAILJET_SECRET_KEY`, `EMAIL_FROM_ADDRESS`,
`EMAIL_FROM_NAME` and `EMAIL_REPLY_TO` (see `.env.example`).

**Also required: the demo parent's mailbox must exist.** `prisma/seed.ts` runs on
every production boot and creates a demo parent, so that address is a live row in
the production database, and the family sign-in form is public. Anyone who types
it causes a real send. The seeded address is `demo-parent@storyjar.co.uk`, and
`storyjar.co.uk` must carry a matching forwarding alias (or a catch-all) so mail
to it is delivered or discarded rather than rejected. An address on a domain we
do not control bounces: the seed previously used `parent@home.com`, and the first
send to it came back `550 Invalid Recipient`. A hard bounce is the metric mailbox
providers weigh most heavily against a new sending domain, and it is trivially
repeatable from a public form.

**Changing the seed does not change production.** The seed skips a database that
already has data, so real accounts and children's work are never wiped by a
redeploy. That also means the demo parent row was written once, on the first
boot, and it still holds the old address. Fix the live row once, by hand:

```
node scripts/fix-demo-parent-address.mjs            # show what it would change
node scripts/fix-demo-parent-address.mjs --apply    # change it
```

It updates one column on one row and touches nothing else. Do **not** reseed
production with `FORCE_SEED=1` to achieve the same thing: that wipes every real
account and every child's work.

> **Staff invitations do not send yet, deliberately.** There is no
> accept-invite flow at all — invited staff are created with an empty password
> hash and have no route to set one — so an invitation email would link nowhere.
> Sending one would be worse than sending none. Tracked as a gap.

---

## Roadmap: what's next

The next milestones, in a sensible order to build them:

1. **Video** recording as a response type, and **recorded voice instructions**
   on activities (voice *notes* from children are now built — see below).
2. **Groups** and tagging work to a group as well as individuals.
3. **Families** — a read-only home view so parents can see published work.
4. **Scheduling & a reusable activity library** to save tasks for next year.

Already built: the journal spine, the multi-tool multi-page canvas with text
boxes, camera/upload photos, **child voice notes** (the top pre-reader
priority — record → approve → publish, through the normal approval queue), and
**activities with canvas/PDF templates, whole-class or per-child assignment, and
the side-by-side responses view**.

---

## Notes on safety & privacy

This first version runs entirely on your own computer and stores everything
locally — nothing is sent anywhere. Before using it with real children's work,
it would need proper hosting, secure teacher passwords, and a privacy review;
those come with the later milestones.
