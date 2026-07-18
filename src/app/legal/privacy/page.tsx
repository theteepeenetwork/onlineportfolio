import { LegalShell } from "../LegalShell";

export const metadata = { title: "Privacy Policy — Storyjar" };

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" intro="This policy explains what personal data Storyjar processes, why, on whose behalf, and the rights people have. A short plain-English version for families is also available.">
      <h2>1. Who is responsible for your data</h2>
      <p>
        Storyjar is provided by <strong>[Legal entity name], [company number], [registered address]</strong>
        {" "}(&ldquo;Storyjar&rdquo;, &ldquo;we&rdquo;). Our Data Protection Officer is <strong>[DPO name / email]</strong>.
        We are registered with the Information Commissioner&apos;s Office (ICO) under <strong>[registration number]</strong>.
      </p>
      <p>
        For the data of <strong>children, parents and staff</strong>, the <strong>school is the data controller</strong>
        {" "}and <strong>Storyjar is a data processor</strong> acting only on the school&apos;s documented instructions.
        The school decides why children&apos;s data is collected; we only handle it to provide the service. For a small
        amount of data about the <strong>account holder</strong> (e.g. a teacher&apos;s login email), we act as controller.
      </p>

      <h2>2. What we process</h2>
      <table>
        <thead><tr><th>Who</th><th>What</th><th>Why</th></tr></thead>
        <tbody>
          <tr><td>Children (3–11)</td><td>First name only; the &ldquo;moments&rdquo; they create (photos, drawings, typed words); optional teacher-added skill tags and dates</td><td>To build the child&apos;s class journal / portfolio for the school</td></tr>
          <tr><td>Teachers / staff</td><td>Name, title, school email, hashed password, role, class assignment</td><td>To create and secure staff accounts and moderate content</td></tr>
          <tr><td>Parents / carers</td><td>Name, email, family code, link to their child(ren)</td><td>To give a read-only family view of approved moments</td></tr>
        </tbody>
      </table>
      <p>
        <strong>We deliberately do not collect:</strong> children&apos;s surnames, dates of birth, addresses, contact
        details, or any behavioural/analytics profiling data. Children never have logins, emails or passwords.
      </p>

      <h2>3. Lawful basis</h2>
      <p>
        The school determines and documents the lawful basis for processing children&apos;s data — typically
        <strong> public task</strong> (UK GDPR Art. 6(1)(e)) for state schools carrying out their educational function,
        with appropriate conditions for any special-category data (e.g. images). Storyjar processes this data solely as
        the school&apos;s processor under Art. 28. For account-holder data we rely on <strong>legitimate interests /
        contract</strong> to operate the service. Photographs of children are handled under the school&apos;s own
        photography consent arrangements.
      </p>

      <h2>4. How moments are controlled</h2>
      <p>
        Every moment a child creates is held privately in a teacher approval queue and is <strong>not visible to anyone
        else until a teacher approves it</strong>. Approved moments are visible only to the child&apos;s teacher(s),
        school admins who teach that class, and the child&apos;s linked parent/carer (read-only). Content is never public.
      </p>

      <h2>5. Where data is stored</h2>
      <p>
        Personal data (database, uploaded media and backups) is stored and processed in the <strong>UK/EU</strong>.
        We do not transfer children&apos;s personal data to the United States or other jurisdictions without an adequacy
        decision or appropriate safeguards. Our current infrastructure and sub-processors are listed in the{" "}
        <a href="/legal/sub-processors">Sub-processors</a> page.
      </p>

      <h2>6. How long we keep it</h2>
      <p>
        We keep a child&apos;s data for as long as the school&apos;s subscription and the school&apos;s own retention
        rules require, and then delete it. A school can export or delete a class&apos;s data at any time; deletion removes
        both the database records and the underlying media files. Full details are set out in the{" "}
        <a href="/legal/data-processing">Data Processing Agreement</a>. <em>[Confirm the exact retention schedule with the DPO.]</em>
      </p>

      <h2>7. Security</h2>
      <p>
        We apply technical and organisational measures appropriate to children&apos;s data (UK GDPR Art. 32), including
        server-side access control scoped to who may see a child&apos;s work, access-controlled media, HTTPS, hashed
        passwords, security headers, least-privilege staff roles, and no third-party trackers. Our internal engineering
        rules are set out in our safeguarding &amp; security governance.
      </p>

      <h2>8. Who we share data with</h2>
      <p>
        We do not sell data and we do not share it for advertising. We share it only with the limited sub-processors
        needed to run the service (see <a href="/legal/sub-processors">Sub-processors</a>), each under a data-processing
        agreement, or where required by law.
      </p>

      <h2>9. Rights</h2>
      <p>
        Because the school is the controller for children&apos;s data, <strong>requests to access, correct, delete or
        export a child&apos;s data are made to the school</strong>, and we support the school in fulfilling them. Parents
        and pupils can raise requests with the school; the school can also contact us. For account-holder data you can
        contact us directly at <strong>[privacy contact]</strong>. You may complain to the ICO (ico.org.uk).
      </p>

      <h2>10. Children&apos;s Code</h2>
      <p>
        Storyjar is designed to meet the ICO&apos;s Age Appropriate Design Code: high-privacy defaults, data
        minimisation, no profiling of children, no nudge techniques, and transparency in language families can
        understand (see the <a href="/legal/privacy-for-families">plain-English version</a>).
      </p>

      <h2>11. Changes</h2>
      <p>We will tell schools about material changes to this policy. This is a draft; the published version will carry a real effective date.</p>
    </LegalShell>
  );
}
