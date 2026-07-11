import { LegalShell } from "../LegalShell";

export const metadata = { title: "Cookie Policy — Storyjar" };

export default function Cookies() {
  return (
    <LegalShell title="Cookie Policy" intro="Storyjar uses the smallest possible number of cookies. We do not use any analytics, advertising or tracking cookies.">
      <h2>What we use</h2>
      <p>Storyjar sets one <strong>strictly necessary</strong> cookie:</p>
      <table>
        <thead><tr><th>Cookie</th><th>Purpose</th><th>Type</th><th>Expiry</th></tr></thead>
        <tbody>
          <tr>
            <td><code>portfolio_session</code></td>
            <td>Keeps a signed-in teacher, student or parent logged in for the duration of their session. It is <code>httpOnly</code> and <code>SameSite=Lax</code>.</td>
            <td>Strictly necessary</td>
            <td>Up to 30 days</td>
          </tr>
        </tbody>
      </table>

      <h2>What we do not use</h2>
      <p>
        We use <strong>no</strong> analytics, advertising, social-media or behavioural-tracking cookies, and no
        third-party trackers. Children are never profiled. Because we only use a strictly necessary cookie, we do not
        need a cookie consent banner under PECR — but you can still clear the cookie by signing out or clearing your
        browser data.
      </p>

      <h2>Changes</h2>
      <p>If we ever introduced a non-essential cookie, we would ask for consent first and update this page. <em>[Confirm with the DPO before adding any new cookie or third-party script.]</em></p>
    </LegalShell>
  );
}
