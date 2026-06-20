import { getAccessToken } from './supabase'

// Generic, jurisdiction-neutral baseline of communications an executor owes the
// heirs/beneficiaries. Exact requirements vary by state — flagged as a future
// per-state feature. category: 'required' = commonly mandated; 'recommended' =
// best practice / situational; 'other' = free-form.
export const HEIR_NOTICE_TYPES = [
  { key: 'appointment', label: 'Notice of appointment / probate opened', category: 'required',
    desc: 'Inform heirs that probate has opened and you have been appointed executor.' },
  { key: 'inventory', label: 'Inventory of estate assets', category: 'required',
    desc: 'Provide beneficiaries the inventory / list of estate assets.' },
  { key: 'annual_accounting', label: 'Annual accounting', category: 'recommended',
    desc: 'Often required when administration lasts more than a year.' },
  { key: 'final_accounting', label: 'Final accounting', category: 'required',
    desc: 'Account for everything received, spent, and distributed before closing.' },
  { key: 'distribution', label: 'Distribution notice', category: 'required',
    desc: 'Notify heirs of the proposed or final distribution of their share.' },
  { key: 'progress_update', label: 'Progress update', category: 'recommended',
    desc: 'A periodic plain-English update. Best practice — transparency reduces disputes.' },
  { key: 'custom', label: 'Other notice / message', category: 'other',
    desc: 'Any other communication to the heirs.' },
]
export const noticeLabel = k => HEIR_NOTICE_TYPES.find(n => n.key === k)?.label || 'Notice'

// Templates the executor can start from for the formal notices (they edit before
// sending). Plain-English, not legal advice.
export const NOTICE_TEMPLATES = {
  appointment: name =>
    `I'm writing to let you know that the estate of ${name || 'our loved one'} has been opened with the court, and I have been appointed to serve as executor.\n\nI'll keep you updated as the process moves forward. Please don't hesitate to reach out with any questions.`,
  inventory: name =>
    `As part of settling the estate of ${name || 'our loved one'}, I've prepared an inventory of the estate's assets. You can view the current asset summary in the family portal.\n\nPlease let me know if you have any questions.`,
  annual_accounting: name =>
    `It's been about a year since the estate of ${name || 'our loved one'} was opened. Below (and in the family portal) is an accounting of what the estate has received, paid out, and currently holds.\n\nI'm happy to answer any questions.`,
  final_accounting: name =>
    `As we move toward closing the estate of ${name || 'our loved one'}, here is the final accounting of everything the estate received, paid out, and will distribute. You can review the full details in the family portal.\n\nPlease review and let me know if you have any questions.`,
  distribution: name =>
    `We've reached the point of distributing the estate of ${name || 'our loved one'}. This note is to inform you of the planned distribution of your share. Details are in the family portal.\n\nPlease reach out with any questions before distribution is finalized.`,
  progress_update: () => '',
  custom: () => '',
}

// Send an update/notice to the estate's heirs (email now; SMS when available)
// and record it as proof. Returns { emailed, texted, recipients, log }.
export async function sendHeirNotice({ estateId, noticeType, title, body, recipientIds = null, channels = ['email'] }) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/notify-heirs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estateId, noticeType, title, body, recipientIds, channels }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || 'Could not send to the heirs')
  return data
}
