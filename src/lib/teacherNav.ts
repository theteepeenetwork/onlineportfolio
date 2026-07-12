// The top-nav links shown across the teacher area. `pending` badges the
// approval queue with the number of items waiting.
export function teacherNav(pending: number) {
  return [
    { href: "/teacher/queue", label: "Queue", badge: pending },
    { href: "/teacher", label: "Journals" },
    { href: "/teacher/activities", label: "Activities" },
    { href: "/teacher/calendar", label: "Calendar" },
    { href: "/teacher/class", label: "My classes" },
    { href: "/teacher/billing", label: "Billing" },
  ];
}
