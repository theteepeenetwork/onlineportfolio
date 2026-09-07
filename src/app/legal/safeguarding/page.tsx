import { LegalShell } from "../LegalShell";

export const metadata = { title: "Safeguarding & Child Protection — StoryJar" };

export default function Safeguarding() {
  return (
    <LegalShell title="Safeguarding & Child Protection" policyKey="safeguarding" intro="StoryJar holds the work of children aged 3–11. Keeping them safe is our first principle — every design decision is made to protect the child.">
      <h2>Our safeguarding principles</h2>
      <ul>
        <li><strong>Children are never account-holders.</strong> No child logins, emails or passwords. Children sign in only with a class code and by tapping their own name.</li>
        <li><strong>We hold as little as possible.</strong> First names and their work — no surnames, birthdays, addresses or contact details.</li>
        <li><strong>An adult always checks first.</strong> Every moment a child makes waits in the teacher&apos;s approval queue and is never shown to anyone until the teacher approves it.</li>
        <li><strong>Access is need-to-know.</strong> A child&apos;s work is visible only to staff who teach that child and to a linked parent/carer (read-only). School admins do not see children&apos;s work unless they teach the class. Media (photos and drawings) is access-controlled, never at a public link.</li>
        <li><strong>No tracking, no profiling, no advertising.</strong> Ever.</li>
        <li><strong>Data stays in Europe</strong> — stored in Amsterdam, in the Netherlands, and backed up in the same region.</li>
      </ul>

      <h2>How this supports schools</h2>
      <p>
        StoryJar operates within a school&apos;s safeguarding regime under <strong>Keeping Children Safe in Education</strong>.
        The school remains responsible for safeguarding; StoryJar provides teacher moderation, private-by-default content,
        least-privilege staff roles, and clear data-handling so the school can meet its duties. It is not a communication
        tool — there is no child-to-child messaging and no unmoderated contact.
      </p>

      <h2>Photographs of children</h2>
      <p>
        Photos are captured by staff on school devices and only stored when a teacher chooses to keep a moment. Schools
        should ensure their existing <strong>photography/consent</strong> arrangements cover use in StoryJar. Approved
        images are shown only to the child&apos;s teacher(s) and linked family.
      </p>

      <h2>Raising a concern</h2>
      <p>
        If you have a <strong>child-safety concern</strong>, contact your school&apos;s <strong>Designated Safeguarding
        Lead (DSL)</strong> in the first instance. If you believe there is a problem with how StoryJar itself is handling
        content or data, contact us at <strong>hello@storyjar.co.uk</strong> and we will work with the school.
        In an emergency where a child is at immediate risk, contact the police or your local authority&apos;s children&apos;s
        services.
      </p>

      <h2>Incidents</h2>
      <p>
        If we become aware of a personal-data breach or a safeguarding issue, we notify the affected school(s) without
        undue delay so they can meet their statutory duties (including the ICO&apos;s 72-hour reporting requirement where
        applicable). StoryJar is a small business, so there is one point of contact for both data-protection and
        safeguarding matters: the person responsible for data protection at <strong>Storyjar Limited</strong>, reachable
        at <strong>hello@storyjar.co.uk</strong>. We do not contact
        children or the public directly about an incident — we go to the school, because the school is the data
        controller and holds the safeguarding relationship with the family.
      </p>
    </LegalShell>
  );
}
