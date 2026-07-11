import { LegalShell } from "../LegalShell";

export const metadata = { title: "Sub-processors — Storyjar" };

export default function SubProcessors() {
  return (
    <LegalShell title="Sub-processors" intro="The third parties Storyjar relies on to run the service, what they do, and where data is held. We keep this list short by design.">
      <p>Each sub-processor below operates under a data-processing agreement. We give schools prior notice before adding or changing a sub-processor.</p>

      <table>
        <thead><tr><th>Sub-processor</th><th>Purpose</th><th>Personal data</th><th>Location</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Railway</strong></td>
            <td>Application hosting, database and file storage</td>
            <td>All service data (children&apos;s moments, staff/parent accounts)</td>
            <td><strong>[UK/EU region — required]</strong></td>
          </tr>
          <tr>
            <td><strong>GitHub</strong></td>
            <td>Source-code hosting (no personal/customer data)</td>
            <td>None (code only)</td>
            <td>—</td>
          </tr>
        </tbody>
      </table>

      <p>
        <strong>Requirement:</strong> every sub-processor that handles personal data must store and process it in the
        <strong> UK/EU</strong>. The hosting region must be set to a UK/EU location before any real child data is
        stored. <em>[Action: confirm and pin the Railway region to UK/EU; keep this table in step with reality.]</em>
      </p>

      <h2>What we deliberately do not use</h2>
      <p>No analytics providers, no advertising networks, no social-media pixels, no behavioural-profiling services. Children are never tracked or profiled.</p>
    </LegalShell>
  );
}
