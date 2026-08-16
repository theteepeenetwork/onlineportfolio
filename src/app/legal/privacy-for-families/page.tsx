import { LegalShell } from "../LegalShell";

export const metadata = { title: "Privacy — plain English — Storyjar" };

export default function PrivacyForFamilies() {
  return (
    <LegalShell title="Privacy — the plain-English version" intro="For parents, carers and children. The full Privacy Policy has all the detail; this is the short, clear version the ICO Children's Code asks us to provide.">
      <h2>What is Storyjar?</h2>
      <p>Storyjar is a place where your child&apos;s teacher keeps a journal of the lovely things your child makes at school — photos, drawings and their own words.</p>

      <h2>What does it know about my child?</h2>
      <p>Only their <strong>first name</strong> and the work they make. That&apos;s it. No surname, no birthday, no address, no email. Your child never has a login or password — they sign in by tapping their name on the class iPad.</p>
      <p>We hold as little about <strong>you</strong> as we do about them. See below.</p>

      <h2>Who can see my child&apos;s work?</h2>
      <ul>
        <li>Their <strong>teacher</strong> (and other staff who teach their class).</li>
        <li><strong>You</strong>, if the school links you — and only your own child, and only things the teacher has approved.</li>
      </ul>
      <p>Nothing your child makes is shown to anyone until their <strong>teacher has checked and approved it</strong>. It is never public. Other families cannot see your child.</p>

      <h2>How do I get in, and what does Storyjar know about me?</h2>
      <p>The school sends home a letter with a <strong>family code</strong>. You type that code at <a href="/family">the family page</a> and you are in. There is no password and nothing to pay.</p>
      <p>We ask the school for your code, not for you. <strong>Storyjar is not told your name, your email address or your phone number</strong>, and your child&apos;s teacher has nowhere to type them even if they wanted to. So unless you tell us yourself, all we hold about you is that somebody in your household has a code for your child.</p>
      <p>Once you are signed in you can <strong>choose</strong> to add your email address, if you would rather be sent a one-tap link than keep the letter. We only ever use it to send you that link. You can clear it whenever you like and we will stop holding it. We will never email you something you did not ask for.</p>
      <p>If you have <strong>more than one child</strong> using Storyjar, sign in with one code, then add the other child&apos;s code in <strong>Your family space</strong>. Both children will then sit behind the same sign-in, even if they are in different classes.</p>
      <p>If your letter goes astray, or you would rather nobody at home had a code, ask at the <strong>school office</strong>. They can send a new code, which stops the old one working straight away, or take the access away altogether. When the last child linked to a code is removed, everything we hold about that family space is deleted.</p>

      <h2>Is it safe?</h2>
      <p>Yes — safety is the whole point. Your child&apos;s photos, drawings and voice notes are kept private and protected, stored on servers in Europe (Amsterdam, in the Netherlands), and we <strong>never</strong> use them for adverts or tracking.</p>

      <h2>What if I want to see it, or ask for it to be removed?</h2>
      <p>Just speak to your child&apos;s school — they&apos;re in charge of the data and can show you, download it, or have it deleted.</p>

      <p style={{ marginTop: 20 }}>Read the full <a href="/legal/privacy">Privacy Policy</a> for all the detail.</p>
    </LegalShell>
  );
}
