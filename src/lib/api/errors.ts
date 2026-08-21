// The one error class the connector is willing to show a caller.
//
// No `server-only`: the validators that raise it are pure and shared, and the
// class has to be `instanceof`-checkable from both sides of that line.
//
// Everything the API refuses on purpose — a missing title, a question with no
// right answer, a folder belonging to somebody else — is raised as one of
// these, and its message is written for a teacher because that is who ends up
// reading it. Anything else that escapes is a fault: it is logged by name and
// answered with a generic sentence, because a raw error can quote a database
// argument carrying another row's contents (SAFEGUARDING rule 8).
export class ActivityInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ActivityInputError";
  }
}
