import { test as base, expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Persona } from "./team";
import { TEAM } from "./team";

// ===========================================================================
// The tester harness: what a persona notices, and how it gets written down.
//
// A persona spec is a journey, not an assertion list. The harness gives it
// three things:
//
//   1. INSTRUMENTATION it never has to ask for. Every unhandled exception,
//      every 5xx, every broken picture and every browser dialog is captured
//      the moment it happens and attributed to the screen the persona was on.
//      A real tester notices "it went wrong" without knowing what a console is.
//
//   2. A SWEEP of the heuristics that decide whether a screen works FOR THIS
//      PERSON — reachable targets at their finger size, words at their reading
//      age, a way back out, no jargon, no sideways scroll. Run on every screen
//      they land on, so coverage follows the journey rather than a list of URLs
//      somebody remembered to update.
//
//   3. A PLACE TO WRITE IT DOWN. `t.say()` records an observation in the
//      persona's own voice. Nothing about an observation stops the test — the
//      report is the deliverable — with ONE exception, below.
//
// THE ONE HARD FAILURE
//
// A `blocker` fails the test at teardown. A blocker is not a matter of taste:
// an unhandled error, a server fault, or a persona who could not finish the job
// they came to do. This project is report-only in CI, so a red persona test
// blocks nothing — but it is loud in the run, and a report nobody reads is the
// failure mode this whole idea has.
//
// WHY THE HEURISTICS ARE SOFT AND THE JOURNEY IS HARD
//
// "This button is 8px too small" is a judgement that belongs in a report a
// person reads. "I could not hand in my work" is not. Keeping the two apart is
// what stops the report becoming a wall of noise that gets muted — the fate of
// every lint rule set to error indiscriminately.
// ===========================================================================

export type Severity = "blocker" | "major" | "minor" | "polish";

export type Kind =
  | "broke" // it errored, crashed, or returned a fault
  | "stuck" // could not finish, or no way onward
  | "confusing" // could not tell what to do or what happened
  | "unreadable" // words or targets beyond this person
  | "fragile" // worked, but breaks if you sneeze on it
  | "slow"; // worked, but not before this person gave up

export type Observation = {
  persona: string;
  personaId: string;
  hat: string;
  device: string;
  journey: string;
  severity: Severity;
  kind: Kind;
  /** In the persona's voice: what they experienced. */
  what: string;
  /** The screen they were on. */
  where: string;
  /** Anything a developer needs to reproduce it. */
  evidence?: string;
};

const SEVERITY_ORDER: Record<Severity, number> = { blocker: 0, major: 1, minor: 2, polish: 3 };

// Where the run's observations land. Gitignored (/playwright-report), read by
// scripts/persona-report.mjs to build USER_TESTING.md.
//
// ONE DIRECTORY PER RUN, named after the Playwright runner's process — which is
// the parent of every worker, constant for a whole run and different between
// runs. Two earlier designs both silently threw findings away:
//
//   1. Clearing behind a module-scoped "have I done this yet" flag. Playwright
//      re-evaluates the module graph per test FILE, so the flag reset nine times
//      and each file deleted the previous file's findings.
//   2. Clearing once in the battery's global setup. That runs for every project,
//      so `npm run test:security` emptied the notebook the report is built from.
//
// A run that writes only into its own directory cannot delete another run's
// work, and there is no flag to get wrong. The report reads the newest one.
const RUN_ID = `run-${process.ppid}`;
const OUT_DIR = path.join(process.cwd(), "playwright-report", "personas", "observations", RUN_ID);

// The directory is emptied ONCE PER RUN, by the battery's global setup — not
// here.
//
// It was here, behind a module-scoped "have I cleared it yet" flag, and that
// flag is a lie: Playwright re-evaluates the module graph for each test FILE,
// so the flag reset nine times in one run and every file wiped the last one's
// findings. The report was assembled from whichever journey happened to run
// last and looked, convincingly, like a clean sweep. A reporting harness that
// silently discards findings is worse than no harness, so the clearing now
// happens in exactly one place that runs exactly once.
function outDir() {
  mkdirSync(OUT_DIR, { recursive: true });
  return OUT_DIR;
}

// Dev-server chatter that says nothing about the product. Kept deliberately
// short: a filter that grows is a filter that eventually hides a real fault.
const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /React DevTools/i,
  /Lighthouse/i,
];

// Developer language that must never reach a user's screen. The static audit
// (scripts/error-string-audit.mjs) catches these in source; this catches the
// ones assembled at runtime, which is where "undefined" usually comes from.
const JARGON = [
  { re: /\bundefined\b/, why: "the word “undefined”" },
  { re: /\bNaN\b/, why: "the word “NaN”" },
  { re: /\[object Object\]/, why: "“[object Object]”" },
  { re: /\b(TypeError|ReferenceError|SyntaxError)\b/, why: "a JavaScript error name" },
  { re: /Internal Server Error/i, why: "“Internal Server Error”" },
  { re: /\bPrisma\b/, why: "the database library's name" },
  { re: /\bstack trace\b/i, why: "“stack trace”" },
  { re: /\bECONNREFUSED\b/, why: "a network error code" },
  { re: /\bnull\b(?![-\w])/, why: "the word “null”" },
];

type Audit = {
  overflowPx: number;
  title: string;
  interactiveCount: number;
  namelessControls: string[];
  smallTargets: { name: string; w: number; h: number }[];
  unlabelledFields: string[];
  placeholderOnlyFields: string[];
  imagesWithoutAlt: string[];
  jargon: string[];
  longWords: string[];
  hasWayBack: boolean;
  visibleText: number;
};

/**
 * Everything the persona can perceive about the current screen, gathered in
 * one pass in the page. Written as one evaluate rather than a dozen locators
 * because a sweep runs on every screen of every journey, and a dozen round
 * trips per screen is the difference between a suite people run and one they
 * skip.
 */
async function auditScreen(page: Page, persona: Persona): Promise<Audit> {
  return page.evaluate(
    ({ minTarget, longestWord }) => {
      const seen = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        const s = getComputedStyle(el);
        return s.visibility !== "hidden" && s.display !== "none" && s.opacity !== "0";
      };
      const nameOf = (el: Element) => {
        const aria = el.getAttribute("aria-label");
        if (aria?.trim()) return aria.trim();
        const labelledBy = el.getAttribute("aria-labelledby");
        if (labelledBy) {
          const t = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ")
            .trim();
          if (t) return t;
        }
        const text = (el as HTMLElement).innerText?.trim();
        if (text) return text;
        const img = el.querySelector("img[alt]");
        if (img?.getAttribute("alt")?.trim()) return img.getAttribute("alt")!.trim();
        const title = el.getAttribute("title");
        if (title?.trim()) return title.trim();
        const value = (el as HTMLInputElement).value;
        if (typeof value === "string" && value.trim()) return value.trim();
        return "";
      };
      const snip = (el: Element) => el.outerHTML.replace(/\s+/g, " ").slice(0, 140);

      const interactive = Array.from(
        document.querySelectorAll<HTMLElement>(
          'button, a[href], [role="button"], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(seen);

      // An inline link inside running text is exempt from the target-size rule
      // (WCAG 2.5.8) — it is sized by the sentence it lives in. Everything a
      // person is meant to aim at is not.
      const isInlineTextLink = (el: Element) =>
        el.tagName === "A" &&
        getComputedStyle(el).display.startsWith("inline") &&
        !!el.closest("p, li, td, dd, figcaption");

      const namelessControls: string[] = [];
      const smallTargets: { name: string; w: number; h: number }[] = [];
      for (const el of interactive) {
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        if (el.tagName === "INPUT" && ["hidden"].includes(type)) continue;
        const name = nameOf(el);
        const labelled =
          name ||
          (el.tagName === "INPUT" &&
            !!(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)));
        if (!labelled && namelessControls.length < 6) namelessControls.push(snip(el));

        if (!isInlineTextLink(el) && el.tagName !== "TEXTAREA") {
          const r = el.getBoundingClientRect();
          // Half a pixel of tolerance, because the number in the report is
          // rounded and the comparison must agree with it: a 63.98px control
          // rounds to "64" and read as "64px — under the 64px floor", which is
          // the sort of line that gets a whole report dismissed.
          if ((r.width < minTarget - 0.5 || r.height < minTarget - 0.5) && smallTargets.length < 8) {
            smallTargets.push({
              name: (name || snip(el)).slice(0, 60),
              w: Math.round(r.width),
              h: Math.round(r.height),
            });
          }
        }
      }

      const unlabelledFields: string[] = [];
      const placeholderOnlyFields: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("input, select, textarea")).filter(seen)) {
        const type = (el.getAttribute("type") ?? "").toLowerCase();
        if (["hidden", "submit", "button", "image", "reset"].includes(type)) continue;
        const hasLabel =
          !!(el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
          !!el.closest("label") ||
          !!el.getAttribute("aria-label")?.trim() ||
          !!el.getAttribute("aria-labelledby")?.trim();
        const placeholder = el.getAttribute("placeholder")?.trim();
        if (!hasLabel && placeholder && placeholderOnlyFields.length < 6) placeholderOnlyFields.push(snip(el));
        else if (!hasLabel && unlabelledFields.length < 6) unlabelledFields.push(snip(el));
      }

      // alt="" is a decorative image and is correct. A MISSING alt is a picture
      // that a screen reader announces as a file name, or not at all.
      const imagesWithoutAlt = Array.from(document.querySelectorAll("img"))
        .filter(seen)
        .filter((img) => !img.hasAttribute("alt"))
        .slice(0, 6)
        .map(snip);

      const main = document.querySelector("main") ?? document.body;
      const text = (main as HTMLElement).innerText ?? "";

      // Words beyond this reader.
      //
      // Scoped to the CONTROLS, not to every word on the page, and the scope is
      // the difference between a finding and a shrug. A class name and a date
      // have to be written down somewhere; what matters for a child who cannot
      // read is whether the things they have to ACT on are decodable — a button
      // whose label they cannot read is a button they cannot use, and the first
      // version of this check buried that under "tuesday" and "ducklings".
      const longWords: string[] = [];
      if (longestWord > 0) {
        const labels = interactive.map((el) => nameOf(el)).join(" ");
        const words = new Set(
          labels
            .split(/[^\p{L}'’-]+/u)
            .filter((w) => w.length > longestWord)
            .map((w) => w.toLowerCase()),
        );
        longWords.push(...Array.from(words).slice(0, 10));
      }

      // A way back out: any link or button that leaves this screen for a place
      // the person already knows. The words are the ones the CHILD-FACING copy
      // actually uses — "Bye bye 👋" is this product's sign-out for a five-year-
      // old, and a checker that only knows the phrase "sign out" reports a way
      // out that is right there on the screen as missing.
      const wayBack = /back|home|jar|journal|my work|cancel|close|done|sign out|log ?out|bye/i;
      const hasWayBack = interactive.some((el) => wayBack.test(nameOf(el)));

      return {
        overflowPx: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        title: document.title,
        interactiveCount: interactive.length,
        namelessControls,
        smallTargets,
        unlabelledFields,
        placeholderOnlyFields,
        imagesWithoutAlt,
        jargon: [] as string[],
        longWords,
        hasWayBack,
        visibleText: text.replace(/\s+/g, " ").trim().length,
        _text: text,
      } as unknown as Audit & { _text: string };
    },
    { minTarget: persona.minTarget, longestWord: persona.longestWord },
  ) as Promise<Audit>;
}

export class Tester {
  readonly observations: Observation[] = [];
  /** How many actions this persona has taken in the current journey. */
  steps = 0;
  private tolerated: RegExp[] = [];
  private screen = "(not opened yet)";
  private sweptScreens = new Set<string>();

  constructor(
    readonly persona: Persona,
    private readonly page: Page,
    private readonly journey: string,
  ) {}

  /** Record something this persona noticed. */
  say(severity: Severity, kind: Kind, what: string, evidence?: string) {
    this.observations.push({
      persona: this.persona.name,
      personaId: this.persona.id,
      hat: this.persona.hat,
      device: this.persona.device.label,
      journey: this.journey,
      severity,
      kind,
      what,
      where: this.screen,
      evidence,
    });
  }

  /** Suppress errors this journey deliberately provokes (a wrong code, a 404). */
  tolerate(pattern: RegExp) {
    this.tolerated.push(pattern);
  }

  isTolerated(text: string) {
    return this.tolerated.some((re) => re.test(text));
  }

  /** Where the persona currently is — used to attribute every observation. */
  setScreen(label: string) {
    this.screen = label;
  }

  get currentScreen() {
    return this.screen;
  }

  /**
   * Open a screen, timed against this persona's patience, then sweep it.
   * `label` is what the PERSON would call it, not the route.
   */
  async open(url: string, label: string) {
    this.setScreen(`${label} (${url})`);
    const started = Date.now();
    await this.page.goto(url);
    const took = Date.now() - started;
    if (took > this.persona.patienceMs) {
      this.say(
        "minor",
        "slow",
        `${label} took ${(took / 1000).toFixed(1)}s to appear — longer than this person waits before assuming it is broken and tapping again.`,
        `budget ${(this.persona.patienceMs / 1000).toFixed(1)}s`,
      );
    }
    this.steps++;
    await this.sweep(label);
  }

  /** One action by the persona: counted, timed, and never silently swallowed. */
  async act(what: string, run: () => Promise<void>) {
    this.steps++;
    const started = Date.now();
    try {
      await run();
    } catch (error) {
      this.say(
        "blocker",
        "stuck",
        `Tried to ${what} and could not: the control was not there, or would not respond.`,
        String(error).split("\n").slice(0, 3).join(" ").slice(0, 400),
      );
      throw new StoppedError(what);
    }
    const took = Date.now() - started;
    if (took > this.persona.patienceMs) {
      this.say(
        "minor",
        "slow",
        `“${what}” took ${(took / 1000).toFixed(1)}s with nothing to say it was working.`,
        `budget ${(this.persona.patienceMs / 1000).toFixed(1)}s`,
      );
    }
  }

  /**
   * "Can I see it?" — the way a person answers it: wait a moment, then decide.
   *
   * This is NOT `isVisible()`, and the difference produced a false finding the
   * first time this harness ran. An instantaneous check straight after a submit
   * answers "no" while the page is still on its way, so the tester wrote down
   * that a correct family code had been refused — and then went looking for a
   * form that no longer existed, which hung until the test timed out. A person
   * waits as long as their patience and then concludes.
   */
  async sees(locator: Locator, waitMs = this.persona.patienceMs): Promise<boolean> {
    try {
      await locator.first().waitFor({ state: "visible", timeout: waitMs });
      return true;
    } catch {
      return false;
    }
  }

  /** As `sees`, for a phrase this person is looking for on the page. */
  async seesText(pattern: RegExp, waitMs = this.persona.patienceMs): Promise<boolean> {
    return this.sees(this.page.getByText(pattern), waitMs);
  }

  /** A soft expectation: records rather than throws. The report is the point. */
  expects(condition: boolean, severity: Severity, kind: Kind, what: string, evidence?: string) {
    if (!condition) this.say(severity, kind, what, evidence);
    return condition;
  }

  /** Did the persona finish the job in the number of moves they expected? */
  budget(max: number, job: string) {
    if (this.steps > max) {
      this.say(
        "minor",
        "confusing",
        `${job} took ${this.steps} moves; ${max} is as many as this person expects before they start looking for a shortcut.`,
      );
    }
    this.steps = 0;
  }

  /** Reset the move counter between jobs inside one journey. */
  newJob() {
    this.steps = 0;
  }

  /**
   * Look at the screen the way this persona does, and write down what does not
   * work for them. Cheap enough to run on every screen; deduped per screen so a
   * journey that passes through a page twice does not report it twice.
   */
  async sweep(label?: string) {
    if (label) this.setScreen(`${label} (${new URL(this.page.url()).pathname})`);
    const key = this.screen;
    if (this.sweptScreens.has(key)) return;
    this.sweptScreens.add(key);

    let audit: Audit & { _text?: string };
    try {
      audit = (await auditScreen(this.page, this.persona)) as Audit & { _text?: string };
    } catch {
      return; // mid-navigation; the next sweep will catch it
    }

    const person = this.persona;

    if (audit.overflowPx > 1) {
      this.say(
        "major",
        "confusing",
        `The page is ${audit.overflowPx}px wider than the screen, so it slides sideways and content goes off the edge.`,
        `${person.device.label} ${person.device.width}×${person.device.height}`,
      );
    }

    if (!audit.title.trim()) {
      this.say("polish", "confusing", "The browser tab has no name, so it is unfindable among open tabs.");
    }

    if (audit.interactiveCount === 0 && audit.visibleText > 0) {
      this.say("major", "stuck", "Nothing on this screen can be clicked or tapped — it is a dead end.");
    } else if (!audit.hasWayBack && person.hat === "child" && !/login|sign-?in|name wall/i.test(this.screen)) {
      // The sign-in screens are exempt: there is nowhere behind them to go back
      // to, and a child who is not signed in has nothing to be stranded from.
      this.say(
        "major",
        "stuck",
        "There is no way back to somewhere I recognise — no back, no home, no jar. A child who lands here by accident is stranded.",
      );
    }

    for (const control of audit.namelessControls) {
      this.say(
        person.hat === "child" ? "major" : "minor",
        "confusing",
        "A control with no words and no label — impossible to know what it does before pressing it (and silent to a screen reader).",
        control,
      );
    }

    for (const t of audit.smallTargets) {
      const why =
        person.hat === "child"
          ? " (SAFEGUARDING rule 18 asks 64px for anything a child taps)"
          : person.device.touch
            ? " (a finger on a tablet, not a mouse pointer)"
            : " (WCAG 2.2 AA 2.5.8 floor)";
      this.say(
        person.hat === "child" ? "major" : "minor",
        "unreadable",
        `“${t.name}” is ${t.w}×${t.h}px — under the ${person.minTarget}px this person can reliably hit${why}.`,
      );
    }

    for (const field of audit.unlabelledFields) {
      this.say("major", "confusing", "A box to type in with no label at all — nothing says what goes in it.", field);
    }
    for (const field of audit.placeholderOnlyFields) {
      this.say(
        "minor",
        "confusing",
        "A box whose only label is grey placeholder text, which disappears the moment you start typing.",
        field,
      );
    }
    for (const img of audit.imagesWithoutAlt) {
      this.say("minor", "unreadable", "A picture with no alt text — a screen reader announces nothing.", img);
    }

    const text = audit._text ?? "";
    for (const { re, why } of JARGON) {
      const hit = text.match(re);
      if (hit && !this.isTolerated(hit[0])) {
        const around = text.slice(Math.max(0, (hit.index ?? 0) - 60), (hit.index ?? 0) + 80).replace(/\s+/g, " ");
        this.say("major", "confusing", `Developer language on screen: ${why}.`, `…${around}…`);
      }
    }

    if (audit.longWords.length && person.reads !== "adult") {
      this.say(
        person.reads === "none" ? "major" : "minor",
        "unreadable",
        `Buttons I cannot read: ${audit.longWords.slice(0, 6).join(", ")}. ${
          person.reads === "none"
            ? "I cannot read at all, so a control labelled only in words is one I press by guessing."
            : "I will guess or give up rather than sound these out."
        }`,
      );
    }
  }

  /**
   * One observation per distinct thing, however many screens it appeared on.
   *
   * The first run of this harness reported the teacher's navigation bar eight
   * times in one journey — once per screen it appears on — and buried three real
   * findings under sixty lines of the same sentence. A tester says "the nav is
   * too small" once and tells you where they saw it; so does this.
   */
  private deduped(): Observation[] {
    const groups = new Map<string, Observation & { seenOn: string[] }>();
    for (const o of this.observations) {
      const key = `${o.severity}|${o.kind}|${o.what}`;
      const existing = groups.get(key);
      if (existing) {
        if (!existing.seenOn.includes(o.where)) existing.seenOn.push(o.where);
      } else {
        groups.set(key, { ...o, seenOn: [o.where] });
      }
    }
    return Array.from(groups.values())
      .map(({ seenOn, ...o }) => ({
        ...o,
        where: seenOn.length > 1 ? `${seenOn[0]} — and ${seenOn.length - 1} more screen${seenOn.length > 2 ? "s" : ""}` : o.where,
        evidence: seenOn.length > 1 ? [o.evidence, `seen on: ${seenOn.join(" · ")}`].filter(Boolean).join(" | ") : o.evidence,
      }))
      .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  }

  /** Everything this persona found, deduped and worst first. */
  get report(): Observation[] {
    return this.deduped();
  }

  /** Attach the whole run to the Playwright report and write it out for the aggregator. */
  flush(testInfo: TestInfo) {
    const file = path.join(
      outDir(),
      `${this.persona.id}--${this.journey.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60)}.json`,
    );
    writeFileSync(
      file,
      JSON.stringify(
        {
          persona: this.persona,
          journey: this.journey,
          // The tester's own verdict, not Playwright's. `testInfo.status` is
          // read during teardown, BEFORE the blocker assertion below has run,
          // so a journey that stopped dead would otherwise be filed as "passed"
          // — and the report would say every tester finished.
          status: this.report.some((o) => o.severity === "blocker") ? "stopped" : (testInfo.status ?? "passed"),
          observations: this.deduped(),
        },
        null,
        2,
      ),
    );
  }
}

/** Thrown when a persona genuinely could not carry on. Already reported. */
export class StoppedError extends Error {
  constructor(what: string) {
    super(`the tester could not ${what}`);
    this.name = "StoppedError";
  }
}

/**
 * Run the rest of a journey only if the persona is still going. A real tester
 * who cannot sign in does not then try to approve work; they stop and tell you.
 * Without this, one blocker produces a page of consequential noise.
 */
export async function carryOn(run: () => Promise<void>) {
  try {
    await run();
  } catch (error) {
    if (error instanceof StoppedError) return;
    throw error;
  }
}

type Fixtures = { tester: Tester };
type Options = { persona: Persona };

export const userTest = base.extend<Options & Fixtures>({
  persona: [TEAM.operator as Persona, { option: true }],

  // NOTE ON THE PARAMETER NAME, here and below. Playwright's fixture callback
  // takes `(fixtures, use)`, and every example in its documentation calls the
  // second argument `use`. It is `provide` here for one reason: React 19 added a
  // `use()` hook, and `react-hooks/rules-of-hooks` — which this repo's Next
  // config turns on for every file — reads a bare `use(...)` call in a
  // non-component function as a misplaced hook and fails the lint. Playwright
  // passes the callback positionally and does not care what it is named.
  //
  // Each persona brings their own device. Overriding the built-in fixtures keeps
  // it in one place: a spec says who it is, never how wide their tablet is.
  //
  // `isMobile` is not decoration. Without it a 390px window is a narrow DESKTOP:
  // the meta viewport is ignored and a perfectly responsive page can be reported
  // as overflowing. Emulating the phone properly is what makes the parent's
  // "it slides sideways" observation worth acting on.
  viewport: async ({ persona }, provide) => {
    await provide({ width: persona.device.width, height: persona.device.height });
  },
  hasTouch: async ({ persona }, provide) => {
    await provide(persona.device.touch);
  },
  isMobile: async ({ persona }, provide) => {
    await provide(persona.device.mobile);
  },

  tester: async ({ page, persona }, provide, testInfo) => {
    const tester = new Tester(persona, page, testInfo.title);

    // --- instrumentation the persona never has to ask for ---
    page.on("pageerror", (error) => {
      if (tester.isTolerated(error.message)) return;
      tester.say("blocker", "broke", "The page threw an error while I was using it.", `${error.name}: ${error.message}`.slice(0, 400));
    });

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      const text = message.text();
      if (CONSOLE_NOISE.some((re) => re.test(text)) || tester.isTolerated(text)) return;
      tester.say("minor", "fragile", "The browser logged an error behind the scenes.", text.slice(0, 300));
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status < 400) return;
      const url = response.url();
      if (tester.isTolerated(url)) return;
      const type = response.request().resourceType();
      if (status >= 500) {
        tester.say("blocker", "broke", "The server failed while I was using the page.", `${status} ${type} ${url}`);
      } else if (type === "document") {
        tester.say("major", "stuck", `A page I opened said ${status} — for me, a wall.`, `${status} ${url}`);
      } else if (type === "image" || type === "media") {
        tester.say("major", "broke", "A picture or sound on the page did not load.", `${status} ${url}`);
      } else {
        tester.say("minor", "fragile", `Something the page asked for came back ${status}.`, `${status} ${type} ${url}`);
      }
    });

    // A browser dialog is a design failure in a child-facing product and a
    // blocker for automation; accept it so the journey continues, and say so.
    page.on("dialog", async (dialog) => {
      tester.say(
        "minor",
        "confusing",
        `A browser pop-up appeared saying “${dialog.message().slice(0, 120)}” — not part of the product, and a child cannot read it.`,
      );
      await dialog.accept().catch(() => {});
    });

    await provide(tester);

    // --- teardown: report, attach, and fail only on blockers ---
    await tester.sweep().catch(() => {});
    tester.flush(testInfo);
    const lines = tester.report.map(
      (o) => `[${o.severity}] ${o.what}\n    where: ${o.where}${o.evidence ? `\n    evidence: ${o.evidence}` : ""}`,
    );
    await testInfo.attach(`${persona.name} — what I found`, {
      body: lines.join("\n\n") || "Nothing to report: this journey worked.",
      contentType: "text/plain",
    });
    const blockers = tester.report.filter((o) => o.severity === "blocker");
    expect(
      blockers.map((b) => `${b.what} (${b.where}${b.evidence ? ` — ${b.evidence}` : ""})`),
      `${persona.name} hit ${blockers.length} blocker(s)`,
    ).toEqual([]);
  },
});

export { expect } from "@playwright/test";
export type { Locator };
