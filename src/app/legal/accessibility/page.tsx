import { LegalShell } from "../LegalShell";

export const metadata = { title: "Accessibility Statement — Storyjar" };

export default function Accessibility() {
  return (
    <LegalShell title="Accessibility Statement" intro="Storyjar should be usable by every child and adult. Accessibility is part of keeping children included and safe.">
      <h2>Our commitment</h2>
      <p>We aim to meet <strong>WCAG 2.2 level AA</strong> and to be usable by young children and by adults with a range of needs.</p>

      <h2>What we do</h2>
      <ul>
        <li><strong>Dyslexia-friendly type:</strong> body text uses Atkinson Hyperlegible, chosen for legibility.</li>
        <li><strong>Big, clear targets for children:</strong> child touch targets are at least 64px; one obvious action per screen.</li>
        <li><strong>Colour &amp; contrast:</strong> text meets AA contrast; colour is never the only way to convey meaning.</li>
        <li><strong>Keyboard &amp; focus:</strong> interactive elements are keyboard-reachable with a visible focus outline.</li>
        <li><strong>Reduced motion:</strong> animations respect <code>prefers-reduced-motion</code>; the interface still works fully with motion off.</li>
        <li><strong>Semantic structure &amp; alt text</strong> for assistive technologies.</li>
      </ul>

      <h2>Known limitations</h2>
      <p>
        We publish what we know rather than claim we are finished. As at August 2026:
      </p>
      <ul>
        <li>
          <strong>A small number of colour-contrast shortfalls remain on adult-facing surfaces</strong> — some status
          badges and role labels in the teacher and admin areas fall just below the AA contrast ratio. Around thirty
          elements are affected. Every child-facing screen meets AA, and this is being fixed as part of settling the
          brand palette.
        </li>
        <li>
          <strong>Voice notes have no automatic transcript.</strong> A recording made by a child is not captioned, so a
          Deaf parent cannot read what was said. A teacher can add a written caption to any moment, and we would rather
          say this plainly than let a family discover it.
        </li>
      </ul>
      <p>
        If something here affects you, please tell us — a known issue that is blocking a real person moves up the list.
      </p>

      <h2>Feedback</h2>
      <p>If you have trouble using any part of Storyjar, tell us at <strong>hello@storyjar.co.uk</strong> and we will help and fix it. We welcome feedback that helps us do better.</p>
    </LegalShell>
  );
}
