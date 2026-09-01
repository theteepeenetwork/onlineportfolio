// The StoryJar Academy roster, derived rather than looked up.
//
// WHY THIS IS A CONSTANT AND NOT A QUERY
//
// An operator screen cannot read any of this, and that is not an oversight to
// be worked around. `Class` is AGGREGATE_ONLY in the blindness gate, the
// sign-in code column is a denied credential identifier, and `classId` is a
// child scope key — the same wall PR4 hit when it refused class code rotation,
// for the same reason: putting a list of class names on an operator screen is a
// widening of what the operator can SEE.
//
// It does not need to be a query. `scripts/ops/seed-academy.mjs` derives every
// address and every code deterministically from the two lists below, so the
// screen can derive the identical strings without asking the database anything.
// The Academy is fictional and StoryJar's own, so these are not a school's
// data; they are the equivalent of a README.
//
// THE DRIFT RISK, AND WHAT ANSWERS IT
//
// Two copies of one scheme is exactly the arrangement where the second one goes
// quietly wrong. `tests/battery/security/ops-academy.spec.ts` reads the seed
// script and asserts the year groups, the forms, the domain and the code
// formula in this file still match the ones in it, so a change to either side
// fails the build rather than misleading somebody at half past four.

export const ACADEMY_SCHOOL_NAME = "StoryJar Academy";
export const ACADEMY_DOMAIN = "academy.storyjar.co.uk";

export const ACADEMY_YEAR_GROUPS = [
  { label: "Nursery", ageMode: "EYFS" },
  { label: "Reception", ageMode: "EYFS" },
  { label: "Year 1", ageMode: "KS1" },
  { label: "Year 2", ageMode: "KS1" },
  { label: "Year 3", ageMode: "KS2" },
  { label: "Year 4", ageMode: "KS2" },
  { label: "Year 5", ageMode: "KS2" },
  { label: "Year 6", ageMode: "KS2" },
] as const;

export const ACADEMY_FORMS = ["Oak", "Elm"] as const;

export const ACADEMY_MANAGER_EMAIL = `manager@${ACADEMY_DOMAIN}`;

// `ACD` plus a two-digit year index plus the form number, so Nursery Oak is
// ACD011 and Year 6 Elm is ACD082. Drawn from the same alphabet as a real code
// (src/lib/classCodeChars.ts excludes I, L, O, 0 and 1) so the sandbox behaves
// like the thing it rehearses.
export function academySignInCode(yearIndex: number, formIndex: number): string {
  return `ACD${String(yearIndex + 1).padStart(2, "0")}${formIndex + 1}`;
}

// The address a member of StoryJar staff types to become that class's teacher:
// the year group lowercased with its spaces removed, a dot, the form, at the
// Academy domain. "Year 3" + "Oak" is year3.oak@academy.storyjar.co.uk.
export function academyTeacherEmail(yearLabel: string, form: string): string {
  return `${yearLabel.toLowerCase().replace(/\s+/g, "")}.${form.toLowerCase()}@${ACADEMY_DOMAIN}`;
}

export type AcademyClassRow = {
  className: string;
  yearGroup: string;
  form: string;
  ageMode: string;
  teacherEmail: string;
  signInCode: string;
};

// All sixteen, in the order the seed makes them: year group outermost, form
// innermost, which is the order somebody comparing this screen with the
// script's own output will read them in.
export function academyClasses(): AcademyClassRow[] {
  const rows: AcademyClassRow[] = [];
  ACADEMY_YEAR_GROUPS.forEach((year, yearIndex) => {
    ACADEMY_FORMS.forEach((form, formIndex) => {
      rows.push({
        className: `${year.label} ${form}`,
        yearGroup: year.label,
        form,
        ageMode: year.ageMode,
        teacherEmail: academyTeacherEmail(year.label, form),
        signInCode: academySignInCode(yearIndex, formIndex),
      });
    });
  });
  return rows;
}
