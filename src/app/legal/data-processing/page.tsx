import { LegalShell } from "../LegalShell";

export const metadata = { title: "Data Processing Agreement — Storyjar" };

export default function DPA() {
  return (
    <LegalShell title="Data Processing Agreement (DPA)" intro="A summary of the processor terms under which Storyjar handles personal data on a school's behalf, as required by UK GDPR Article 28. A signable version is available for your office.">
      <p><em>[This is a plain summary. A full, signable DPA — with the required Art. 28(3) clauses and schedules — should be prepared and reviewed by a solicitor/DPO. Contact <strong>[dpo@storyjar.co.uk]</strong> for the signable version.]</em></p>

      <h2>1. Roles</h2>
      <p>The <strong>school is the controller</strong>; <strong>Storyjar is the processor</strong>. We process personal data only on the school&apos;s documented instructions, as needed to provide Storyjar, and for no other purpose. We never sell data or use it for advertising or profiling.</p>

      <h2>2. Subject-matter &amp; details (Schedule)</h2>
      <ul>
        <li><strong>Subject-matter:</strong> providing a class journal/portfolio service.</li>
        <li><strong>Duration:</strong> the term of the subscription.</li>
        <li><strong>Nature &amp; purpose:</strong> storing and displaying children&apos;s learning moments under teacher moderation.</li>
        <li><strong>Data types:</strong> children&apos;s first names and their work (incl. images); staff account data; parent contact data and child links.</li>
        <li><strong>Data subjects:</strong> pupils (aged 3–7), school staff, parents/carers.</li>
      </ul>

      <h2>3. Our obligations (Art. 28(3))</h2>
      <ul>
        <li>Process only on documented instructions.</li>
        <li>Ensure persons authorised to process are under confidentiality obligations.</li>
        <li>Apply appropriate technical &amp; organisational security measures (Art. 32) — access control scoped to who may see a child&apos;s work, access-controlled media, encryption in transit, hashed passwords, least-privilege roles.</li>
        <li>Engage sub-processors only under equivalent terms and with notice (see <a href="/legal/sub-processors">Sub-processors</a>); remain responsible for them.</li>
        <li>Assist the school with data-subject requests, DPIAs, and breach notification.</li>
        <li>Notify the school of a personal-data breach without undue delay.</li>
        <li>On termination, delete or return all personal data (deletion removes records and media files) at the school&apos;s choice.</li>
        <li>Make available information to demonstrate compliance and allow audits.</li>
      </ul>

      <h2>4. International transfers</h2>
      <p>Personal data is stored and processed in the <strong>UK/EU</strong>. We will not transfer children&apos;s personal data outside the UK/EU without an adequacy decision or appropriate safeguards, and will tell the school first.</p>

      <h2>5. Sub-processors</h2>
      <p>Current sub-processors and their locations are listed on the <a href="/legal/sub-processors">Sub-processors</a> page. We will give schools prior notice of changes and an opportunity to object.</p>
    </LegalShell>
  );
}
