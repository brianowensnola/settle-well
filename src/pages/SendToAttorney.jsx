import { useState } from 'react'
import { useEstate } from '../lib/EstateContext'

const ATTORNEY_INFO_REQUIREMENTS = [
  { section: 'Immediate', items: ['Death certificate copies', 'Full legal name of deceased', 'Date and location of death'] },
  { section: 'Estate Overview', items: ['Estate value (estimated)', 'State of residence', 'Will/trust location', 'Administrator/executor contact'] },
  { section: 'Assets', items: ['Real estate', 'Bank accounts', 'Investment accounts', 'Retirement accounts (401k, IRA)', 'Life insurance policies', 'Vehicles', 'Business interests'] },
  { section: 'Debts & Obligations', items: ['Mortgages', 'Credit card debts', 'Personal loans', 'Pending lawsuits', 'Monthly bills/subscriptions'] },
  { section: 'Beneficiaries', items: ['Spouse status', 'Children (adult & minor)', 'Other beneficiaries', 'Guardianship needs (if minor dependents)'] },
  { section: 'Legal Documents', items: ['Will text', 'Trust document', 'Power of attorney', 'Healthcare directive', 'HIPAA release forms'] },
  { section: 'Taxes', items: ['Prior tax returns (5 years)', 'Employment records', 'Income sources', 'Estimated tax liability'] },
]

export default function SendToAttorney() {
  const { currentEstate } = useEstate()
  const [format, setFormat] = useState('email')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  async function generateSummary() {
    const summary = `
ESTATE ADMINISTRATION SUMMARY
Generated: ${new Date().toLocaleDateString()}

═══════════════════════════════════════════════════════════

DECEASED:
- Name: ${currentEstate.deceased_name}
- Date of Death: ${currentEstate.deceased_dod}
- State of Residence: ${currentEstate.state_of_residence}

ADMINISTRATOR:
- Name: ${currentEstate.administrator_name}
- Email: ${currentEstate.administrator_email}

ESTATE NAME: ${currentEstate.name}
STATUS: ${currentEstate.status}

═══════════════════════════════════════════════════════════

INFORMATION NEEDED FROM ADMINISTRATOR:

${ATTORNEY_INFO_REQUIREMENTS.map(req => `

${req.section.toUpperCase()}:
${req.items.map(item => `  • ${item}`).join('\n')}
`).join('')}

═══════════════════════════════════════════════════════════

NEXT STEPS:
1. Administrator to provide all requested information
2. Attorney review & probate filing (if needed)
3. Asset inventory & appraisals
4. Creditor notification & claims resolution
5. Tax preparation & filing
6. Asset distribution

═══════════════════════════════════════════════════════════

For access to the SettleWell estate management system, contact the administrator.
    `

    return summary
  }

  async function handleSend() {
    setSending(true)
    const summary = await generateSummary()

    if (format === 'email') {
      // Create mailto link
      const subject = encodeURIComponent(`Estate Administration Summary: ${currentEstate.deceased_name}`)
      const body = encodeURIComponent(summary)
      window.location.href = `mailto:?subject=${subject}&body=${body}`
    } else {
      // Copy to clipboard
      await navigator.clipboard.writeText(summary)
    }

    setSent(true)
    setSending(false)
    setTimeout(() => setSent(false), 3000)
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate selected.</div>

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900 dark:text-white mb-2">Send to Attorney</h1>
        <p className="text-gray-600 dark:text-gray-400">Share estate information and required documents</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Estate Summary */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Estate Summary</h2>
          <div className="space-y-3 text-sm">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Deceased:</span>
              <p className="font-medium text-gray-900 dark:text-white">{currentEstate.deceased_name}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Date of Death:</span>
              <p className="font-medium text-gray-900 dark:text-white">{currentEstate.deceased_dod}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">State:</span>
              <p className="font-medium text-gray-900 dark:text-white">{currentEstate.state_of_residence}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Administrator:</span>
              <p className="font-medium text-gray-900 dark:text-white">{currentEstate.administrator_name}</p>
            </div>
            <div>
              <span className="text-gray-500 dark:text-gray-400">Email:</span>
              <p className="font-medium text-gray-900 dark:text-white">{currentEstate.administrator_email}</p>
            </div>
          </div>
        </div>

        {/* Info Requirements */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Attorney Will Request:</h2>
          <ul className="space-y-2 text-sm">
            {ATTORNEY_INFO_REQUIREMENTS.slice(0, 4).map((req, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-gray-400 mt-1">•</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{req.section}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{req.items.length} items</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Send Options */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Send Estate Information</h2>

        <div className="space-y-3 mb-6">
          <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="format"
              value="email"
              checked={format === 'email'}
              onChange={e => setFormat(e.target.value)}
            />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Email to Attorney</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Open your email client with pre-filled summary</p>
            </div>
          </label>

          <label className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-800 rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
            <input
              type="radio"
              name="format"
              value="clipboard"
              checked={format === 'clipboard'}
              onChange={e => setFormat(e.target.value)}
            />
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Copy to Clipboard</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Copy summary to paste into your own email</p>
            </div>
          </label>
        </div>

        <button
          onClick={handleSend}
          disabled={sending}
          className="w-full px-4 py-3 bg-gray-900 dark:bg-gray-700 text-white rounded-lg font-medium hover:bg-gray-700 disabled:opacity-50"
        >
          {sending ? 'Preparing...' : sent ? '✓ Copied to clipboard' : 'Generate & Send'}
        </button>
      </div>

      {/* Info Checklist */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6">
        <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-4">Information Attorney Will Request:</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ATTORNEY_INFO_REQUIREMENTS.map((req, idx) => (
            <div key={idx}>
              <p className="font-medium text-blue-900 dark:text-blue-300 text-sm mb-2">{req.section}</p>
              <ul className="space-y-1">
                {req.items.map((item, i) => (
                  <li key={i} className="text-xs text-blue-800 dark:text-blue-400 flex items-center gap-2">
                    <span>□</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
