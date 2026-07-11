import { LegalShell } from "../LegalShell";

export const metadata = { title: "Acceptable Use Policy — Storyjar" };

export default function AcceptableUse() {
  return (
    <LegalShell title="Acceptable Use Policy" intro="What may and may not be put into Storyjar. Teachers are the moderators, so this is mainly a guide for staff.">
      <h2>Storyjar is for children's learning moments</h2>
      <p>It is a place for a child&apos;s own work — drawings, photos of what they&apos;ve made or done, and their words — kept for the class journal. It is not a general photo store, a messaging tool, or a place for personal or sensitive records.</p>

      <h2>The teacher&apos;s role</h2>
      <p>Every moment passes through a teacher before it is kept. Teachers should approve only content that is appropriate, and send back or delete anything that is not. Please do not approve:</p>
      <ul>
        <li>Images or text that identify a child beyond their first name (e.g. surnames, addresses, dates of birth) or that show another child without the school&apos;s consent arrangements being met.</li>
        <li>Anything upsetting, unsafe, discriminatory, or unlawful.</li>
        <li>Personal or special-category information that isn&apos;t needed for the journal (e.g. medical or family details).</li>
        <li>Content that isn&apos;t the child&apos;s own learning work.</li>
      </ul>

      <h2>Not allowed</h2>
      <ul>
        <li>Giving a child their own login, email or password (they don&apos;t need one).</li>
        <li>Sharing login details or letting unauthorised adults access children&apos;s work.</li>
        <li>Using Storyjar to contact children directly or outside the school&apos;s supervision.</li>
        <li>Attempting to access another class&apos;s or family&apos;s data, or to circumvent access controls.</li>
        <li>Uploading malware, or content that infringes others&apos; rights.</li>
      </ul>

      <h2>If something&apos;s wrong</h2>
      <p>If inappropriate content is uploaded, a teacher should return or delete it and, if it raises a safeguarding concern, follow the school&apos;s procedures and inform the <strong>Designated Safeguarding Lead</strong>. See the <a href="/legal/safeguarding">Safeguarding</a> page. We may suspend access where needed to protect children.</p>
    </LegalShell>
  );
}
