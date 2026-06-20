import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'
import { useUser } from '../lib/AuthContext'
import { isFullAccess } from '../lib/roles'

// Feature flag — OFF during Brian's own live use. Flip to true for the resale
// product so every executor must acknowledge their fiduciary duties (liability
// protection). The acknowledge_disclaimer RPC + disclaimer_ack_at column stay in
// place, so turning this on resumes one-time-per-estate gating with no other work.
const DISCLAIMER_GATE_ENABLED = false

// Shown ONCE per executor (ever): a plain-English summary of their fiduciary
// responsibilities, which they must acknowledge before working an estate. The
// acknowledgment is recorded across all their estate_users rows via the
// acknowledge_disclaimer RPC, so they're never re-prompted. Not legal advice.
export default function DisclaimerGate() {
  const { currentEstate, role } = useEstate()
  const user = useUser()
  const [needsAck, setNeedsAck] = useState(false)
  const [agree, setAgree] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let off = false
    setNeedsAck(false); setAgree(false)
    if (!DISCLAIMER_GATE_ENABLED || !currentEstate || !user || !isFullAccess(role)) return
    // Once per executor ever: acknowledged if ANY of their rows is marked.
    supabase.from('estate_users').select('disclaimer_ack_at').eq('auth_user_id', user.id)
      .then(({ data }) => { if (!off) setNeedsAck(Array.isArray(data) && data.length > 0 && !data.some(r => r.disclaimer_ack_at)) })
    return () => { off = true }
  }, [currentEstate?.id, user?.id, role])

  if (!needsAck) return null

  async function acknowledge() {
    setBusy(true)
    const { error } = await supabase.rpc('acknowledge_disclaimer', { p_estate_id: currentEstate.id })
    setBusy(false)
    if (!error) setNeedsAck(false)
    else alert(`Couldn't record acknowledgment: ${error.message}`)
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full max-h-[88vh] overflow-y-auto p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Your role as executor</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Before you manage the {currentEstate.deceased_name} estate, please read and acknowledge your responsibilities.
        </p>

        <div className="text-sm text-gray-700 dark:text-gray-300 space-y-2 mb-4">
          <p>As executor (personal representative) you have a <strong>fiduciary duty</strong> — a legal obligation to act in the best interest of the estate and its beneficiaries. In general that means:</p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li><strong>Act honestly and in the estate's interest</strong>, not your own. Avoid conflicts of interest and self-dealing.</li>
            <li><strong>Keep the estate's money separate</strong> from your own — use a dedicated estate account; never commingle funds.</li>
            <li><strong>Keep accurate records</strong> of every asset, debt, payment, and decision. You may have to account for them to the court and the heirs.</li>
            <li><strong>Pay valid debts and taxes</strong> in the order your state requires, and meet filing and notice <strong>deadlines</strong>.</li>
            <li><strong>Protect and preserve estate property</strong> (keep insurance active, secure the residence, etc.) until it is distributed.</li>
            <li><strong>Communicate with beneficiaries</strong> and treat them fairly and impartially.</li>
          </ul>
          <p className="pt-1">
            <strong>SettleWell is a tool to help you stay organized — it is not a law firm and does not provide legal advice.</strong>
            It does not replace your attorney. For legal questions, deadlines, and decisions specific to your situation, consult the estate's attorney or the probate court.
          </p>
        </div>

        <label className="flex items-start gap-2 text-sm text-gray-800 dark:text-gray-200 mb-4">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-0.5" />
          <span>I understand my responsibilities as executor and that SettleWell does not provide legal advice.</span>
        </label>

        <button onClick={acknowledge} disabled={!agree || busy}
          className="w-full px-4 py-2.5 bg-gray-900 dark:bg-gray-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-gray-800">
          {busy ? 'Saving…' : 'I acknowledge — continue'}
        </button>
      </div>
    </div>
  )
}
