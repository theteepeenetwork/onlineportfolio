// The top-nav links shown across the teacher area. `pending` badges the
// approval queue with the number of items waiting.
export function teacherNav(pending: number) {
  return [
    { href: "/teacher", label: "Journals" },
    { href: "/teacher/activities", label: "Activities" },
    { href: "/teacher/queue", label: "Approvals", badge: pending },
    { href: "/teacher/class", label: "Class" },
  ];
}
