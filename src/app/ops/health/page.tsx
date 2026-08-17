import type { ReactNode } from "react";
import { requireOperator } from "@/lib/ops/session";
import { databaseAnswerTime } from "@/lib/ops/reads";
import {
  MONITORED,
  NOT_MONITORED,
  answerTimeLabel,
  instanceFacts,
  uptimeLabel,
  type Fact,
} from "@/lib/ops/health";
import { OpsBar, OpsFootnote, type OpsPath } from "../shell";

// ---------------------------------------------------------------------------
// Service health: what this running copy of Storyjar knows about itself.
// ---------------------------------------------------------------------------
//
// THE FAILURE THIS SCREEN IS BUILT AGAINST
//
// A health pane is almost entirely status, and the easy way to build one is to
// draw seven tiles and colour them green until something tells you otherwise.
// Nothing tells you otherwise, because most of the feeds do not exist yet. The
// result is a screen that says everything is fine at 7am on the day the volume
// filled up, and the person who believes it has ten schools waiting.
//
// So the rule here, which is also this PR's gate in the handbook, is: a tile
// with no feed renders "not monitored" and says why. Five of the seven do. That
// is not a shortfall to be tidied away before the pilot; it is the accurate
// picture of what is watched today, and it is the only version of this screen
// worth having.
//
// WHY IT NEVER CALLS /api/health (handbook R19)
//
// Ruling R19 fixes the public endpoint's body at exactly {"ok":true} and adds
// that PR6 "renders the internal result rather than fetching the public
// endpoint". Both halves matter. A page that fetches its own service's
// healthcheck is reporting on the fetch: it will say "up" whenever the request
// succeeds, which is whenever the page is able to render at all, and it turns
// one operator refresh into a database read and a write to the media volume.
// So this page works out what it can from inside the process instead. The
// blindness gate refuses `fetch(` anywhere under the ops roots, so the rule is
// a build failure rather than a convention, and A31 asserts it again at the
// network layer against the running page.
//
// WHAT IT WOULD TAKE TO LIGHT UP THE TWO DARKEST TILES, recorded here because
// the answer is short and somebody will ask
//
// The startup check at src/app/api/health/route.ts already tests the database
// and the media volume for real, and its verdict is exactly what the media and
// startup tiles below want. It cannot be read from here, and no amount of
// rearranging this file changes that: the checker touches the filesystem and
// the Prisma client, the gate refuses both to every file in the ops import
// graph, and the graph is walked one hop up (anything importing an ops module)
// and then transitively down. The clean shape is a pure verdict store outside
// the ops roots that the route writes to and this page reads, which needs one
// reviewed line on the gate's import allowlist. That is a tech lead decision,
// not something to be taken while writing a screen, so it is reported rather
// than made, and until it is taken these tiles say what is true today.
//
// WHAT IS DELIBERATELY NOT HERE
//
//   - No button, no form, no field. Ruling R13: no live pipeline run from a
//     web button. `billing:freeze` is idempotent and safe, and it is still not
//     here, because a job an operator can set off is an operation, and
//     operations live on the closed registry with a stated reason and an audit
//     row in the same transaction. Adding one is the owner's call.
//   - No Railway API credential, and therefore no deploy history, no metrics
//     and no log tail. Brief 01 and the handbook both refuse the credential;
//     the Railway dashboard renders all of that well and is one labelled link
//     away.
//   - No embedded dashboard of any kind. Handbook section 6 item 9 bans img,
//     iframe, object, embed and CSS url() everywhere under ops, which rules out
//     the usual answer of framing somebody else's status page.
//   - No colour that means anything. See src/lib/ops/health.ts.

export const dynamic = "force-dynamic";

// No title, for the reason given at length in src/app/ops/page.tsx: Next
// renders a page's metadata even when the page itself answers notFound(), so a
// title travels out in the 404 body and names the area to anybody who asks.
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

const RAILWAY_DASHBOARD = "https://railway.com/dashboard";

function FactList({ facts }: { facts: Fact[] }) {
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
      {facts.map((fact) => (
        <div key={fact.term} className="py-1">
          <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
            {fact.term}
          </dt>
          <dd style={{ color: "var(--ink)", overflowWrap: "anywhere" }}>
            {fact.iso ? <time dateTime={fact.iso}>{fact.value}</time> : fact.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// One tile. The status is a `dd` whose `dt` reads "Status", so the word is
// associated with its label programmatically rather than sitting next to it and
// hoping. Nothing here is a colour, a dot or an icon: see the note at the top of
// src/lib/ops/health.ts for why that is a design rule on this screen and not a
// preference.
//
// `value` rather than the obvious React prop name: the blindness gate refuses
// the identifier `children` anywhere under the ops roots, because on a Parent it
// is the linked-children relation ruling R11 bans. See src/app/ops/shell.tsx.
function Tile({
  id,
  heading,
  status,
  facts,
  value,
}: {
  id: string;
  heading: string;
  status: typeof MONITORED | typeof NOT_MONITORED;
  facts?: Fact[];
  value: ReactNode;
}) {
  return (
    <li className="card p-5" data-tile={id}>
      <h2 className="font-display text-xl" style={{ color: "var(--ink)" }}>
        {heading}
      </h2>
      <dl className="mt-2">
        <dt className="text-sm font-bold" style={{ color: "var(--ink)" }}>
          Status
        </dt>
        <dd data-tile-status style={{ color: "var(--ink)" }}>
          {status}
        </dd>
      </dl>
      {facts ? <FactList facts={facts} /> : null}
      <div className="mt-3" style={{ color: "var(--ink)" }}>
        {value}
      </div>
    </li>
  );
}

export default async function OpsHealthPage() {
  await requireOperator();

  const answerMs = await databaseAnswerTime();
  const uptimeSeconds = process.uptime();
  const startedAt = new Date(Date.now() - uptimeSeconds * 1000);
  const facts = instanceFacts(process.env, startedAt);

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/health" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Service health
        </h1>
        <p className="mt-2" style={{ color: "var(--ink)" }}>
          This is what this running copy of Storyjar knows about itself, worked out from inside the
          process. It is not a monitoring system, and it is not the Railway dashboard. Where there is
          no signal it says <strong>{NOT_MONITORED}</strong> and says why, because a tile that looks
          calm because its feed is missing is worse than no tile at all.
        </p>
        <p className="mt-2" style={{ color: "var(--ink)" }}>
          <strong>Nothing on this screen can be run from here.</strong> There is no button to start a
          job, re-run a check or freeze an account. Anything an operator can set off is an operation,
          which means a stated reason, a confirmation and an audit row written in the same breath, and
          the list of those is closed.
        </p>

        <ul className="mt-6 grid gap-4">
          <Tile
            id="database"
            heading="The database"
            status={MONITORED}
            facts={[{ term: "Answered", value: answerTimeLabel(answerMs) }]}
            value={
              <p>
                This tile can only ever say yes, and it is worth knowing why: the sign-in check that
                let you onto this page reads the database too, so a database that was not answering
                would have shown you a not-found page instead of this one. The number is the part to
                read. It sits on the same volume as everything the children have made, and a volume in
                trouble goes slow well before it goes wrong.
              </p>
            }
          />

          <Tile
            id="instance"
            heading="This copy of the app"
            status={MONITORED}
            facts={[{ term: "Up for", value: uptimeLabel(uptimeSeconds) }, ...facts]}
            value={
              <p>
                All of this comes from the process itself and from the variables Railway sets on it,
                so it needs no credential and can be believed. It describes <em>this</em> instance and
                nothing else: there is no Railway key in this app, on purpose, so nothing here can
                tell you about another environment or about the platform underneath.
              </p>
            }
          />

          <Tile
            id="media-volume"
            heading="The media volume"
            status={NOT_MONITORED}
            value={
              <>
                <p>
                  Free space, and whether the volume can still be written to, are not readable from
                  this screen. That is deliberate rather than unfinished: the operator area is refused
                  every filesystem call by the blindness gate, because every byte on that volume is a
                  child&rsquo;s photograph, drawing or voice note.
                </p>
                <p className="mt-2">
                  Why it matters anyway: the volume holds the database as well as the media, and it
                  is small. It was 5 GB when the Railway dashboard was last read by hand, and this
                  screen can tell you neither what it is now nor how full it is. When it fills,
                  saving work stops, and it looks to a teacher like a bug in the app.
                </p>
              </>
            }
          />

          <Tile
            id="startup-check"
            heading="The startup check"
            status={NOT_MONITORED}
            value={
              <>
                <p>
                  Railway calls <code>/api/health</code> before it moves traffic onto a new version,
                  and that check is real: it reads the database and writes and deletes a file on the
                  media volume. Its verdict is not shown here, for the same reason as the tile above,
                  and this page never calls it. A page that fetched its own service&rsquo;s
                  healthcheck would be reporting on the fetch.
                </p>
                <p className="mt-2">
                  Know what it does and does not do. It gates a <em>deploy</em>: a version that boots
                  broken never takes traffic, and the one before it keeps serving. It notices nothing
                  about an instance that was fine at nine and is stuck at eleven, and restart-on-fail
                  only catches a process that exits, not one that is wedged.
                </p>
              </>
            }
          />

          <Tile
            id="outside-watch"
            heading="Watching from outside"
            status={NOT_MONITORED}
            value={
              <p>
                Nothing outside this service checks that it answers. An external uptime monitor is
                owner decision D13 and it has not been taken, so there is no feed to show here and no
                alert to expect. What that costs, stated plainly: if this app stops answering at four
                in the morning, the first person to find out is a teacher at twenty to nine.
              </p>
            }
          />

          <Tile
            id="backups"
            heading="Backups"
            status={NOT_MONITORED}
            value={
              <p>
                There is no backup job in this repository, nothing schedules one and nothing records
                one, so there is no last-successful time and no size to compare against yesterday.
                The backup decision is owner decision D2 and it is still open. Note while it is:
                RETENTION.md describes a 35-day rolling backup cycle to schools, and until D2 is
                answered that line and this tile disagree. This tile is the one that is true.
              </p>
            }
          />

          <Tile
            id="scheduled-jobs"
            heading="Scheduled jobs"
            status={NOT_MONITORED}
            value={
              <p>
                <code>billing:freeze</code> exists as a command and does the right thing when it is
                run by hand: it is idempotent, it deletes nothing and it writes its own audit row.
                Nothing schedules it and nothing writes down that it ran, so there is no last run to
                show. There is deliberately no button here to run it either. A job an operator can set
                off is an operation, and operations are named, listed on the closed registry, and
                carry a reason and an audit row; adding this one is the owner&rsquo;s call, not a
                convenience to be slipped onto a status screen.
              </p>
            }
          />
        </ul>

        <h2 className="mt-8 font-display text-xl" style={{ color: "var(--ink)" }}>
          What this screen cannot tell you
        </h2>
        <ul className="mt-2 list-disc ps-5" style={{ color: "var(--ink)" }}>
          <li>Whether Storyjar is up. You are reading it, so it is.</li>
          <li>
            Anything about another instance, another environment or the platform underneath. This app
            holds no Railway credential and is not going to.
          </li>
          <li>Whether mail is reaching parents. Nothing on this screen watches that.</li>
          <li>
            Processor, memory, network, deploy history and logs. Railway already renders those well,
            and rebuilding them here would make this area larger and therefore riskier for no gain.
          </li>
        </ul>
        <p className="mt-3">
          <a
            href={RAILWAY_DASHBOARD}
            target="_blank"
            rel="noreferrer noopener"
            style={{
              color: "var(--ink)",
              textDecoration: "underline",
              textUnderlineOffset: "4px",
              minHeight: 44,
              display: "inline-flex",
              alignItems: "center",
              overflowWrap: "anywhere",
            }}
          >
            Open the Railway dashboard (leaves Storyjar, opens in a new tab)
          </a>
        </p>
      </main>
      <OpsFootnote />
    </div>
  );
}
