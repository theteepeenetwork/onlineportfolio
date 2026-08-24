"use client";

// ---------------------------------------------------------------------------
// The school picker: step 2 of signup, England only.
// ---------------------------------------------------------------------------
//
// WHAT IT IS FOR. A teacher's school is free text today, so two colleagues type
// "St Bede's Primary" and "St Bedes CofE Primary School" and nothing in the
// product can tell they work together (docs/school-identity.md). This box
// records the DfE's URN **alongside** that free text, never instead of it: the
// text is what the teacher believes their school is called and it is what the
// teacher shell and the ops console already show; the URN is a join key for
// later. Keeping both is what stops a future re-import renaming a teacher's own
// school out from under them.
//
// WHAT IT IS NOT. Picking your school does not create a school, join you to
// colleagues, or give anybody admin over your class. Nothing else in the
// product changes. That gap is explained on screen below rather than left to be
// discovered, because "I picked my school, where is everyone?" is otherwise a
// support email in week two (docs/school-identity-launch.md, "Out of scope").
//
// WHY IT IS HAND-BUILT. `<datalist>` is the accessible thing you reach for
// first and it was ruled out on display grounds before accessibility got a
// vote: no browser renders two lines per option, and a list of twenty
// identically-named St Mary's Primary Schools with nothing to tell them apart
// is not a picker. So this is a combobox built to the ARIA pattern — virtual
// focus via aria-activedescendant, so DOM focus never leaves the input and
// typing never breaks mid-word.
//
// THE FOUR STATES ALL END SOMEWHERE. Results, no results, too short, and the
// throttle's "busy". Every one of them leaves the teacher able to finish, and
// the free-text field IS the input, so the fallback needs no extra control. The
// sentences live in @/lib/schoolPicker so the one that is announced and the one
// that is tested are the same string.
//
// THE ACCESSIBLE NAME OF AN OPTION IS ONE STRING. Two visual lines, one label:
// a screen reader user hears "St Bede's Catholic Primary School, Lancaster,
// LA1 5QP" as a single coherent option rather than a name followed by three
// loose fragments. `establishmentLabel` composes it and the a11y spec asserts
// the aria-label EQUALS it, so the two cannot drift.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useRef, useState } from "react";
import { searchEstablishments } from "@/app/actions/establishments";
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_CHARS,
  establishmentLabel,
  type EstablishmentResult,
} from "@/lib/establishmentSearch";
import {
  GIAS_ATTRIBUTION,
  GIAS_ATTRIBUTION_LICENCE_URL,
} from "@/lib/establishmentRegister";
import { pickerAnnouncement, selectionSummary, type PickerState } from "@/lib/schoolPicker";

const INPUT: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  font: "400 18px var(--font-atkinson)",
  padding: "14px 16px",
  border: "3px solid var(--ink)",
  borderRadius: 12,
  background: "var(--paper)",
  color: "var(--ink)",
};
const FIELD_LABEL: React.CSSProperties = {
  display: "block",
  font: "700 16px var(--font-atkinson)",
  marginBottom: 6,
};
const HINT: React.CSSProperties = {
  margin: "6px 0 0",
  font: "400 14px/1.5 var(--font-atkinson)",
  color: "var(--sj-muted)",
};
// The calm panel, not the error panel. Nothing this box says is a telling-off:
// a school missing from a snapshot of somebody else's CSV is the register's
// problem, not the teacher's.
const CALM_PANEL: React.CSSProperties = {
  marginTop: 12,
  background: "var(--cream)",
  border: "2px solid var(--calm-border)",
  borderRadius: 12,
  padding: "12px 16px",
};

/** One option. Active gets a border as well as a fill — never colour alone. */
const OPTION = (active: boolean): React.CSSProperties => ({
  listStyle: "none",
  cursor: "pointer",
  padding: "10px 14px",
  borderLeft: `4px solid ${active ? "var(--ink)" : "transparent"}`,
  background: active ? "#D8ECE8" : "var(--paper)",
  color: "var(--ink)",
});

export function SchoolPicker({
  value,
  urn,
  onPick,
}: {
  /** The school name as it will be stored. Always free text; the picker fills it in. */
  value: string;
  /** The URN stored alongside it, or null when the teacher typed the name themselves. */
  urn: string | null;
  /** Both halves move together, always. There is no path that sets one alone. */
  onPick: (name: string, urn: string | null) => void;
}) {
  // Fixed ids, not useId(). The picker renders at most once on the page — it is
  // one field of one step of one wizard, and only when Country is England — so
  // there is nothing to collide with, and `su-` is what every other field on
  // this step is already called. Fixed ids also mean the option id the a11y
  // spec asserts `aria-activedescendant` against is a value it can predict
  // rather than one it has to read back out of the attribute it is checking.
  const inputId = "su-school";
  const listId = "su-school-list";
  const hintId = "su-school-hint";
  const optionId = (i: number) => `${listId}-opt-${i}`;

  // What we last SEARCHED for, which is not the same as what is in the input.
  // Choosing a school writes its name into the input without touching this, so
  // a selection does not fire a fresh search for the thing just selected.
  const [term, setTerm] = useState("");
  const [state, setState] = useState<PickerState>({ kind: "idle" });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [picked, setPicked] = useState<string | null>(urn ? value : null);

  // Monotonic, so a slow answer to an old query can never overwrite a fast
  // answer to a new one. Typing is faster than a round trip and a teacher who
  // types one more letter must not see the previous letter's list.
  const seq = useRef(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Alive at all? Pressing Continue unmounts this component while a search may
  // still be in flight — `page.fill()` followed straight by Continue is exactly
  // that, and it is what the existing signup specs do. React will not warn about
  // a state update after unmount any more, which is precisely why it is worth
  // guarding here: the failure would be silent, and the persona suite treats an
  // unhandled error during a teacher's first day as a BLOCKER rather than a
  // note. The debounce timer is cleared by the effect's own cleanup; this covers
  // the request that has already left.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const items = state.kind === "results" ? state.items : [];

  const run = useCallback(async (q: string) => {
    const mine = (seq.current += 1);

    // A THROWN request is a different thing from a refused one, and both have to
    // land somewhere. `refused: "busy"` is the server answering; a rejected
    // promise is a dropped connection, an aborted request or an unhandled error
    // on the server — and on a school's connection the first of those is the
    // likeliest failure this component will ever see.
    //
    // Unhandled, it would be exactly the silent failure the `alive` guard below
    // was written to prevent, on exactly the screen named there:
    // personas/teacher-first-day.spec.ts walks this step and treats an unhandled
    // error as a BLOCKER rather than a note. Guarding staleness against that
    // consequence and leaving rejection unguarded was the gap.
    //
    // It lands in `busy`, which is already the honest sentence for it — "we
    // could not check the register just then", followed by the free-text path.
    // The teacher does not need to know which of the two happened, and neither
    // ends anywhere they cannot finish from.
    let res: Awaited<ReturnType<typeof searchEstablishments>>;
    try {
      res = await searchEstablishments(q);
    } catch {
      if (alive.current && mine === seq.current) {
        setState({ kind: "busy" });
        setOpen(false);
      }
      return;
    }
    // Two different staleness questions, and both have to be asked. `alive`
    // means the step has moved on; `seq` means the teacher has typed another
    // letter and a slow answer to the old query must not replace a fast answer
    // to the new one.
    if (!alive.current || mine !== seq.current) return;
    if (res.refused === "busy") {
      setState({ kind: "busy" });
      setOpen(false);
      return;
    }
    if (res.refused === "too-short") {
      setState({ kind: "too-short" });
      setOpen(false);
      return;
    }
    if (res.items.length === 0) {
      setState({ kind: "no-results", query: q });
      setOpen(false);
      return;
    }
    setState({ kind: "results", items: res.items, truncated: res.truncated });
    setOpen(true);
    // NOTHING IS PRE-HIGHLIGHTED WHEN RESULTS ARRIVE, and this is a decision
    // rather than an omission, so it is written down where the next person will
    // ask it.
    //
    // -1 means "the list is open and the teacher has chosen nothing yet". The
    // first ArrowDown therefore lands on option 0, because (-1 + 1) % n is 0.
    //
    // The alternative — highlight the first row so Enter works immediately — is
    // defensible for an ordinary search box and wrong here for two reasons.
    // `aria-activedescendant` is a claim about where the user is; setting it to
    // a row nobody moved to announces a choice the teacher did not make, and it
    // changes under them on every keystroke as results come back. And Enter
    // would then commit the top match of a half-typed query — which for this
    // field is not a search result but a JOIN KEY stored against their account,
    // where a plausible wrong answer is worse than no answer (the whole reason
    // docs/school-identity.md refuses fuzzy matching).
    //
    // The cost is one keypress for a teacher whose school is top of the list.
    // The a11y spec asserts the numbering that follows from this, so if the
    // decision is ever reversed that spec is where it will be argued out.
    setActive(-1);
  }, []);

  // The debounce is SEARCH_DEBOUNCE_MS, imported rather than chosen here: the
  // number the picker waits is the number @/lib/establishmentSearch documents,
  // and the minimum is checked here as well as on the server so a query too
  // short to be answered is not sent at all.
  useEffect(() => {
    const q = term.trim();
    if (q === "") {
      seq.current += 1;
      setState({ kind: "idle" });
      setOpen(false);
      return;
    }
    if (q.length < SEARCH_MIN_CHARS) {
      seq.current += 1;
      setState({ kind: "too-short" });
      setOpen(false);
      return;
    }
    const t = setTimeout(() => void run(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [term, run]);

  // Virtual focus still has to be VISIBLE. DOM focus stays in the input, so the
  // browser will not scroll the active option into view on its own.
  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (e: EstablishmentResult) => {
    // The NAME goes in the box, because the name is what the product shows
    // everywhere else. The URN rides alongside it and the label is repeated
    // below, so the town and postcode that did the disambiguating do not
    // vanish the instant the list closes.
    onPick(e.name, e.urn);
    setPicked(establishmentLabel(e));
    setOpen(false);
    setActive(-1);
    setState({ kind: "idle" });
  };

  const onKeyDown = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    const n = items.length;
    switch (ev.key) {
      case "ArrowDown":
        if (n === 0) return;
        ev.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(0);
        } else setActive((i) => (i + 1) % n);
        return;
      case "ArrowUp":
        if (n === 0) return;
        ev.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(n - 1);
        } else setActive((i) => (i <= 0 ? n - 1 : i - 1));
        return;
      case "Home":
        if (!open || n === 0) return;
        ev.preventDefault();
        setActive(0);
        return;
      case "End":
        if (!open || n === 0) return;
        ev.preventDefault();
        setActive(n - 1);
        return;
      case "Enter":
        // Only swallowed when it is choosing something. With the list shut,
        // Enter belongs to the wizard, not to this box.
        if (!open || active < 0) return;
        ev.preventDefault();
        choose(items[active]);
        return;
      case "Escape":
        if (!open) return;
        ev.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      default:
    }
  };

  return (
    // Named so the a11y gate can scan THIS region strictly. The page-wide axe
    // sweep still tolerates the two F11 baseline rules; nothing new should need
    // that tolerance, and a spec that can point at just this subtree is how
    // that stays true without anyone editing BASELINE_RULES.
    <div id="su-school-picker">
      <label htmlFor={inputId} style={FIELD_LABEL}>
        School name
      </label>
      {/* THE LIST IS POSITIONED, NOT IN FLOW, and that is a correctness fix
          rather than a nicety — see the comment on the <ul> below. This wrapper
          is what it is positioned against. */}
      <div style={{ position: "relative" }}>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-describedby={hintId}
        // Only ever set to an option that is rendered and visible. An empty
        // string here is a reference to nothing, which is why it is omitted
        // rather than blanked.
        aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
        // The browser's own dropdown would sit on top of this one.
        autoComplete="off"
        value={value}
        onChange={(ev) => {
          // Editing the text ALWAYS drops the URN. A teacher who picks one
          // school and then edits the name must not end up storing a URN that
          // contradicts the name beside it — that is the exact quiet mismatch
          // this feature exists to remove.
          onPick(ev.target.value, null);
          setPicked(null);
          setTerm(ev.target.value);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
        }}
        placeholder="Start typing your school's name or postcode"
        style={INPUT}
      />

      {/* Always in the DOM, hidden when shut. `aria-controls` above points at
          it, and a reference to an element that is not there is an invalid
          value — so it exists whether or not it is showing.

          OUT OF FLOW, AND THE REASON IS A BUG THIS HAD. In normal flow, opening
          the list pushed everything below it down by up to 280px — including
          step 2's Continue button. Closing it pulled them back up. Those two
          happen either side of a single click: pressing the mouse down on
          Continue blurs the input, blur closes the list, the button leaps up
          before the mouse comes back up, and because a `click` needs its down
          and its up on the SAME element, no click event fires at all. The
          teacher presses Continue while looking at a list of schools and
          nothing happens — and pressing it again works, which is exactly the
          shape of fault that gets reported as "it's a bit glitchy" and never
          reproduced.

          Positioning the list removes the whole class: nothing below it ever
          moves, so no element can be pulled out from under a press. It is also
          what every other combobox on the web does, for the same reason. */}
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        aria-label="Schools matching what you typed"
        hidden={!open}
        // Keeps DOM focus in the input when an option is clicked: mousedown is
        // what blurs, and blur is what would close the list before the click
        // could land on it.
        onMouseDown={(ev) => ev.preventDefault()}
        style={{
          // `hidden` alone would do it, but the project's CSS reset touches
          // list elements and a picker that silently stops hiding is a bad way
          // to find that out. The two agree; neither is load-bearing alone.
          display: open ? "block" : "none",
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          // Above the two <select>s beneath it, which it now overlaps by design.
          zIndex: 20,
          margin: 0,
          padding: 0,
          maxHeight: 280,
          overflowY: "auto",
          border: "3px solid var(--ink)",
          borderRadius: 12,
          background: "var(--paper)",
        }}
      >
        {items.map((e, i) => (
          <li
            key={e.urn}
            id={optionId(i)}
            role="option"
            aria-selected={i === active}
            // ONE string, overriding the two visual lines on purpose. See the
            // header: four fragments is not an option label.
            aria-label={establishmentLabel(e)}
            onClick={() => choose(e)}
            onMouseMove={() => setActive(i)}
            style={OPTION(i === active)}
          >
            <span style={{ display: "block", font: "700 17px var(--font-atkinson)" }}>{e.name}</span>
            <span style={{ display: "block", font: "400 15px var(--font-atkinson)", color: "var(--ink-soft)" }}>
              {[e.town, e.postcode].filter(Boolean).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      </div>

      {/* Polite. A count that interrupts every keystroke is worse than no count
          at all — the same call as ActivitySearchBox, for the same reason. */}
      <p
        aria-live="polite"
        style={{ margin: "6px 0 0", font: "400 14px/1.5 var(--font-atkinson)", color: "var(--sj-muted)" }}
      >
        {picked ? selectionSummary(picked) : pickerAnnouncement(state)}
      </p>

      {/* The free-text path, shown as an ordinary way to finish rather than as
          a failure. A school that opened last term, or one that has just
          changed name, is simply not in a snapshot yet. */}
      {(state.kind === "no-results" || state.kind === "busy") && !picked && (
        <div style={CALM_PANEL}>
          <p style={{ margin: 0, font: "700 15px var(--font-atkinson)", color: "var(--ink)" }}>
            Type it in yourself — that works too
          </p>
          <p style={{ margin: "4px 0 0", font: "400 15px/1.6 var(--font-atkinson)", color: "var(--ink-soft)" }}>
            {state.kind === "busy"
              ? "We could not check the register just then. Whatever you write in the box is what we will use, so you can carry straight on."
              : "The list is a snapshot of the Department for Education's register, so a new school — or one that has recently changed its name — may not be in it yet. Whatever you write in the box is what we will use."}
          </p>
        </div>
      )}

      <p id={hintId} style={HINT}>
        Type at least {SEARCH_MIN_CHARS} characters of your school&rsquo;s name or its postcode, then choose from the
        list. Not in the list? Just type the name and carry on.
      </p>

      {/* What picking a school does and does NOT do. Written now rather than
          answered by email later (docs/school-identity-launch.md). */}
      <p style={HINT}>
        Choosing your school helps us spell it correctly and keeps your account tidy. It does not connect you to
        colleagues or share anything with them &mdash; your class, and your pupils&rsquo; work, stay yours alone.
      </p>

      {/* Open Government Licence v3.0 attribution, on the page that uses the
          data (docs/school-identity-launch.md). One copy of the sentence, and
          it is imported rather than retyped so the wording here, the wording in
          docs/brand-and-copy.md and the wording anywhere else stay one wording.
          Ordinary body text, and the licence is a real link.

          UNDERLINED, not coloured. `link-in-text-block` is one of the two rules
          the a11y gate still baselines (F11), and a new link distinguished only
          by colour would be a fresh instance of a debt that is being burned
          down. "Opens in a new tab" is said rather than left to be discovered,
          because losing a half-finished signup to a licence is a poor trade. */}
      <p style={{ ...HINT, marginTop: 10 }}>
        {GIAS_ATTRIBUTION.replace(/\.$/, "")}{" "}
        (
        <a
          href={GIAS_ATTRIBUTION_LICENCE_URL}
          target="_blank"
          rel="noreferrer"
          style={{ color: "var(--ink)", textDecoration: "underline" }}
        >
          read the licence, opens in a new tab
        </a>
        ).
      </p>
    </div>
  );
}
