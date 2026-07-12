import { LegalShell } from "../LegalShell";

export const metadata = { title: "Terms of Service — Storyjar" };

export default function Terms() {
  return (
    <LegalShell title="Terms of Service" intro="These terms govern a school's and its staff's use of Storyjar. They are written for the school as the customer.">
      <h2>1. The agreement</h2>
      <p>These Terms, together with the <a href="/legal/data-processing">Data Processing Agreement</a> and <a href="/legal/acceptable-use">Acceptable Use Policy</a>, form the agreement between the school (&ldquo;you&rdquo;) and Storyjar. By creating an account or using the service you accept them on behalf of your school.</p>

      <h2>2. The service</h2>
      <p>Storyjar is a class journal and portfolio for children aged 3–7. Teachers create classes, children add moments (photos, drawings, words), and teachers approve them before they join a child&apos;s journal. Parents may be given a read-only family view.</p>

      <h2>3. Accounts &amp; responsibilities</h2>
      <ul>
        <li>Only staff who are appropriately DBS-checked and authorised by the school should hold accounts.</li>
        <li>You are responsible for keeping login details secure and for the actions taken under your accounts.</li>
        <li>You are responsible for obtaining any consents your school requires (e.g. for photographs) and for your own safeguarding and data-protection duties as the data controller.</li>
        <li>Children must never be given their own login credentials — the service is designed so they don&apos;t need any.</li>
      </ul>

      <h2>4. Acceptable use</h2>
      <p>Use of Storyjar must comply with the <a href="/legal/acceptable-use">Acceptable Use Policy</a>. We may suspend access to protect children or the service.</p>

      <h2>5. Fees</h2>
      <p>Paid plans are billed as set out at sign-up (e.g. per teacher / month, billed annually). <em>[Confirm commercial terms, trial and cancellation.]</em></p>

      <h2>6. Data protection</h2>
      <p>We process personal data as your processor under the <a href="/legal/data-processing">Data Processing Agreement</a> and our <a href="/legal/privacy">Privacy Policy</a>. Data is held in the UK/EU.</p>

      <h2>7. Availability &amp; support</h2>
      <p>We aim to keep Storyjar available and to support schools, but the service is provided &ldquo;as is&rdquo; without warranties beyond those that cannot be excluded by law. <em>[Confirm SLA/support commitments.]</em></p>

      <h2>8. Liability</h2>
      <p><em>[Liability provisions to be drafted by a solicitor — nothing here limits liability that cannot be limited in law, including for death or personal injury caused by negligence.]</em></p>

      <h2>9. Termination &amp; your data</h2>
      <p>Either party may end the agreement per the cancellation terms. On termination you can export your data, and we will delete it in line with the Data Processing Agreement.</p>

      <h2>10. Law</h2>
      <p>These Terms are governed by the law of <strong>England and Wales</strong> and subject to its courts.</p>
    </LegalShell>
  );
}
