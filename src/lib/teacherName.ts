// How a teacher's greeting name is derived from what they enter at signup.
// This is the ONE place the app turns (title, full name, display style) into a
// greeting — the dashboard, welcome screen and any future settings screen all
// read the stored `displayName`, never `name.split(" ")[0]` (which produced the
// "Hello Mr" bug when the raw name started with a title).

export type DisplayStyle = "formal" | "first";

export type TeacherNameInput = {
  title: string; // "Mr" / "Miss" / … or "" for "prefer not to say"
  fullName: string; // "Sam Pearson"
  displayStyle: DisplayStyle;
};

export type DerivedTeacherName = {
  firstName: string;
  lastName: string;
  formalName: string; // title + surname, e.g. "Mr Pearson"
  firstNamePreview: string; // first name, e.g. "Sam"
  displayName: string; // the greeting name for the chosen style
};

// Derive the greeting parts. Full name splits on whitespace: first token is the
// first name, last token (if any) the surname; formal = title + surname (falls
// back to first name when there's no surname).
export function deriveTeacherName({ title, fullName, displayStyle }: TeacherNameInput): DerivedTeacherName {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName = parts.length > 1 ? parts[parts.length - 1] : "";
  const formalName = ((title ? title + " " : "") + (lastName || firstName)).trim();
  const firstNamePreview = firstName;
  const displayName = displayStyle === "first" ? firstNamePreview : formalName;
  return { firstName, lastName, formalName, firstNamePreview, displayName };
}
