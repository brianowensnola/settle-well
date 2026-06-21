import { Link } from 'react-router-dom'

// Public privacy policy (no login required) — required for the App Store and
// good practice given the sensitivity of estate data. DRAFT: have an attorney
// review before public/commercial launch. Keep the subprocessor list accurate
// as the stack changes.
const EFFECTIVE = 'June 21, 2026'

export default function Privacy() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 py-10 px-4">
      <div className="max-w-2xl mx-auto bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 md:p-8">
        <div className="flex items-center gap-2 mb-6">
          <img src="/logo.png" alt="SettleWell" className="h-8 w-8 rounded" />
          <span className="font-semibold text-gray-900 dark:text-white">SettleWell</span>
        </div>

        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Privacy Policy</h1>
        <p className="text-xs text-gray-400 mb-6">Effective {EFFECTIVE} · SettleWell is operated by BEPO Services LLC.</p>

        <div className="prose-sm text-sm text-gray-700 dark:text-gray-300 space-y-5 leading-relaxed">
          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Who we are</h2>
            <p>SettleWell is software that helps an executor or administrator organize and settle an estate. SettleWell is <strong>not a law firm and does not provide legal, tax, or financial advice.</strong> For legal questions, consult a licensed attorney.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Information we collect</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Account information</strong> you provide — name, email address, and phone number.</li>
              <li><strong>Estate information you enter</strong> — details about the deceased, heirs and contacts, tasks, assets, accounts, financial figures, documents you upload, communications, and any credentials you choose to store.</li>
              <li><strong>Usage and device information</strong> needed to operate the app securely (e.g., log and diagnostic data).</li>
            </ul>
            <p>You decide what to put into SettleWell. We recommend not entering information you are not comfortable storing online.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">How we use it</h2>
            <p>To provide and secure the service: to run your estate workspace, generate documents and updates, send communications you initiate, and support your account. We do <strong>not sell your personal information.</strong></p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Service providers (subprocessors)</h2>
            <p>We use trusted vendors to operate SettleWell. They process data only to provide their service to us:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Supabase</strong> (hosted on Amazon Web Services) — database and document storage.</li>
              <li><strong>Netlify</strong> — application hosting and serverless functions.</li>
              <li><strong>Brevo</strong> — sending email and text messages you initiate.</li>
              <li><strong>Amazon Web Services (SES)</strong> — receiving email sent to your estate's address.</li>
              <li><strong>Anthropic</strong> — AI features (the assistant, document reading, and email drafting) send the relevant estate text and documents to Anthropic's Claude API to generate results. Under Anthropic's commercial terms, this content is <strong>not used to train their models.</strong></li>
            </ul>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Who can see your data</h2>
            <p>Only people you invite to an estate can access that estate, and only at the access level you grant (executor, collaborator, heir, or observer). Heirs see a limited transparency view; sensitive items (such as stored credentials and full account numbers) are restricted to the executor. Access is enforced at the database level (row-level security).</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Security</h2>
            <p>Data is encrypted in transit (HTTPS) and at rest. Access is restricted by per-estate permissions. No system is perfectly secure, but we work to protect your information using industry-standard measures.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Retention &amp; deletion</h2>
            <p>We keep your data while your account is active. You may request deletion of your account and associated data at any time by contacting us, and in-app account deletion is available in Settings. When an estate is deleted, its data is removed from our active systems.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Children</h2>
            <p>SettleWell is not directed to children under 13 and we do not knowingly collect their information.</p>
          </section>

          <section>
            <h2 className="font-semibold text-gray-900 dark:text-white">Contact</h2>
            <p>Questions or requests: <a href="mailto:info@settlewellestate.com" className="text-blue-600 dark:text-blue-400">info@settlewellestate.com</a>.</p>
          </section>
        </div>

        <div className="mt-8 pt-4 border-t border-gray-100 dark:border-gray-800">
          <Link to="/login" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">← Back to sign in</Link>
        </div>
      </div>
    </div>
  )
}
