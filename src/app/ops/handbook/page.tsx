import { IDLE_LIFETIME_MINUTES, requireOperator } from "@/lib/ops/session";
import { OpsBar, OpsFootnote } from "../shell";
import {
  BreakGlassBody,
  ConcernBody,
  Documents,
  HowItWorks,
  IncidentBody,
  NeverDo,
  Procedure,
  ReadFirst,
  RequestsBody,
  RetentionBody,
  Screens,
  Section,
} from "./sections";

// The handbook: how StoryJar works, what this console may and may not do, and
// the procedures, kept on the screen where the decisions get made.
//
// WHO IT IS FOR. The owner, and the next person who is given a sign-in here.
// Onboarding an operator is currently a conversation, which means it is
// different every time and its accuracy depends on who is tired. This page is
// the version that does not vary. It reads nothing and changes nothing, so it
// is the one screen in this area that is safe to read while learning.
//
// It carries no numbers about the service. A "12 schools" on a handbook page
// would be a second, unaudited report of the same figure the Schools screen
// shows with its provenance, and the first one to drift would be this one.

export const dynamic = "force-dynamic";

// NO TITLE, deliberately, exactly as src/app/ops/page.tsx explains: Next renders
// a page's metadata even when the page throws notFound(), so a title naming the
// area travels out in the 404 body and names it to anybody who asks for the URL
// (ruling R17).
export const metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function OpsHandbookPage() {
  await requireOperator();

  return (
    <div style={{ minHeight: "100vh", background: "var(--paper)" }}>
      <OpsBar current="/ops/handbook" />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <h1 className="font-display text-2xl" style={{ color: "var(--ink)" }}>
          Handbook
        </h1>
        <p className="mt-2" style={{ color: "var(--ink-soft)" }}>
          How the service works, what this console may never do, and what to do when the ordinary
          path is not enough. Written to be read by somebody on their first day.
        </p>

        <Section id="read-first" heading="Read this first" body={<ReadFirst />} />
        <Section id="how-it-works" heading="How StoryJar works" body={<HowItWorks />} />
        <Section id="screens" heading="What each screen here does" body={<Screens idleMinutes={IDLE_LIFETIME_MINUTES} />} />
        <Section id="never" heading="What this console may never do" body={<NeverDo />} />

        <Section
          id="procedures"
          heading="Procedures"
          body={
            <div>
              <p className="mt-3" style={{ color: "var(--ink)" }}>
                Five of them. Open the one you need — each says at the top when it applies, so you
                can rule it out without reading it.
              </p>
              <Procedure
                title="Break glass: reaching a pupil's data outside the product"
                whenToUse="Five circumstances only, and somebody outside StoryJar is told before anything is opened."
                body={<BreakGlassBody />}
              />
              <Procedure
                title="Personal data has been exposed"
                whenToUse="Any suspected breach, however small, and however likely it is to turn out to be nothing."
                body={<IncidentBody />}
              />
              <Procedure
                title="A school asks for a copy, or asks us to delete"
                whenToUse="Subject access, erasure, or a school instructing us in writing."
                body={<RequestsBody />}
              />
              <Procedure
                title="How long we keep things"
                whenToUse="Answering a school or a parent about deletion, freezing or leavers."
                body={<RetentionBody />}
              />
              <Procedure
                title="A safeguarding concern reaches us"
                whenToUse="Anything about a child's safety, including a concern about a school itself."
                body={<ConcernBody />}
              />
            </div>
          }
        />

        <Section id="documents" heading="Where the documents live" body={<Documents />} />
      </main>
      <OpsFootnote />
    </div>
  );
}
