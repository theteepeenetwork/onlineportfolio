import { LegalShell } from "../LegalShell";

export const metadata = { title: "Privacy — plain English — Storyjar" };

export default function PrivacyForFamilies() {
  return (
    <LegalShell title="Privacy — the plain-English version" intro="For parents, carers and children. The full Privacy Policy has all the detail; this is the short, clear version the ICO Children's Code asks us to provide.">
      <h2>What is Storyjar?</h2>
      <p>Storyjar is a place where your child&apos;s teacher keeps a journal of the lovely things your child makes at school — photos, drawings and their own words.</p>

      <h2>What does it know about my child?</h2>
      <p>Only their <strong>first name</strong> and the work they make. That&apos;s it. No surname, no birthday, no address, no email. Your child never has a login or password — they sign in by tapping their name on the class iPad.</p>

      <h2>Who can see my child&apos;s work?</h2>
      <ul>
        <li>Their <strong>teacher</strong> (and other staff who teach their class).</li>
        <li><strong>You</strong>, if the school links you — and only your own child, and only things the teacher has approved.</li>
      </ul>
      <p>Nothing your child makes is shown to anyone until their <strong>teacher has checked and approved it</strong>. It is never public. Other families cannot see your child.</p>

      <h2>Is it safe?</h2>
      <p>Yes — safety is the whole point. Your child&apos;s photos and drawings are kept private and protected, stored in the UK/EU, and we <strong>never</strong> use them for adverts or tracking.</p>

      <h2>What if I want to see it, or ask for it to be removed?</h2>
      <p>Just speak to your child&apos;s school — they&apos;re in charge of the data and can show you, download it, or have it deleted.</p>

      <p style={{ marginTop: 20 }}>Read the full <a href="/legal/privacy">Privacy Policy</a> for all the detail.</p>
    </LegalShell>
  );
}
