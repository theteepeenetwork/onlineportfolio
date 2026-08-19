import { LegalShell } from "../LegalShell";

export const metadata = { title: "Sub-processors — StoryJar" };

export default function SubProcessors() {
  return (
    <LegalShell title="Sub-processors" intro="The third parties StoryJar relies on to run the service, what they do, and where data is held. We keep this list short by design.">
      <p>Each sub-processor below operates under a data-processing agreement. We give schools prior notice before adding or changing a sub-processor.</p>

      <table>
        <thead><tr><th>Sub-processor</th><th>Purpose</th><th>Personal data</th><th>Location</th></tr></thead>
        <tbody>
          <tr>
            <td><strong>Railway</strong></td>
            <td>Application hosting, database and file storage</td>
            <td>All service data (children&apos;s moments, staff/parent accounts)</td>
            <td><strong>EU West — Amsterdam, Netherlands (EEA)</strong></td>
          </tr>
          <tr>
            <td><strong>Stripe</strong></td>
            <td>Subscription billing &amp; payment processing (Checkout, Customer Portal, invoicing)</td>
            <td><strong>Adult billing data only</strong> — the billing contact&apos;s name and email, or a school&apos;s name. No children&apos;s data is ever sent to Stripe. Card details are handled entirely by Stripe; StoryJar never sees or stores them.</td>
            <td>Adult billing data only. <strong>[Residency assessment pending review]</strong></td>
          </tr>
          <tr>
            <td><strong>Mailjet (Sinch)</strong></td>
            <td>Transactional email — the sign-in link we send a parent, and staff notifications</td>
            <td><strong>Adult email addresses only</strong> — a parent&apos;s or staff member&apos;s address. <strong>No child&apos;s name, and no child&apos;s work, ever appears in an email</strong>: our messages are written so that if one reached the wrong person by a mistyped address, it would tell them nothing about any child. <strong>We cannot tell whether a particular parent opened an email, or whether they clicked the link in it.</strong> Open tracking and click tracking are switched off across the whole account, which covers every message we send, and switched off again on each individual message. Mailjet keeps a record of the messages it sent for us (who each one went to, when, the subject line, and whether it arrived) for <strong>90 days</strong> on the plan we are on. Mailjet&apos;s published documentation does not say separately how long it holds the individual delivery events, or whether it holds a copy of the message itself, so <strong>we are not going to quote you a figure for those</strong>; getting that confirmed in writing is a recorded open item. What we can say is that a sign-in link works <strong>once</strong> and stops working after <strong>30 minutes</strong>, so a stored copy would not be a lasting way into a family&apos;s account.</td>
            <td>EU only (Google Cloud, EU data centres)</td>
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
        <strong>Stripe &amp; data residency:</strong> Stripe processes <strong>adult billing data only</strong> — never any
        personal data of children. The UK/EU-only requirement (rule&nbsp;10) applies to children&apos;s and account-holders&apos;
        personal data; the residency of Stripe&apos;s billing processing is recorded here as an <em>open item for review</em>
        before real payments are taken.
      </p>

      <p>
        <strong>Where children&apos;s data is held:</strong> in the <strong>Netherlands (EU West, Amsterdam)</strong>.
        Children&apos;s moments, photographs, voice recordings and all account data are stored and processed there, on a
        volume in the same region. Confirmed 15 August 2026. Every sub-processor that handles personal data must store
        and process it in the <strong>UK or EEA</strong>; this table is kept in step with reality, and a region change
        would be notified to schools in advance.
      </p>

      <p>
        <strong>Being precise about &ldquo;UK&rdquo;:</strong> data is held in the <em>EEA</em>, not in the UK itself.
        Transfers from the UK to EEA countries are covered by the UK&apos;s adequacy regulations, so no additional
        transfer safeguard is required. Railway is a US-incorporated company, so its personnel may access systems for
        support from outside the EEA under its own data-processing terms. <em>[Open item for review: obtain and
        record Railway&apos;s DPA and its onward-transfer terms.]</em> We would rather state this plainly than let a
        school&apos;s data lead discover it later.
      </p>

      <h2>What we deliberately do not use</h2>
      <p>No analytics providers, no advertising networks, no social-media pixels, no behavioural-profiling services. Children are never tracked or profiled.</p>
    </LegalShell>
  );
}
