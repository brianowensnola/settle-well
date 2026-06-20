import { supabase, getAccessToken } from './supabase'

// Common estate emails the app can draft for you. Keys map to the server's
// INTENTS in draft-email.js.
export const EMAIL_INTENTS = [
  { key: 'attorney_status', label: 'Attorney — status / follow-up' },
  { key: 'attorney_question', label: 'Attorney — ask a question' },
  { key: 'attorney_send', label: 'Attorney — send requested info/documents' },
  { key: 'bank_balances', label: 'Bank — request date-of-death balance' },
  { key: 'bank_statements', label: 'Bank — request statements' },
  { key: 'bank_notify', label: 'Bank — notify of death / freeze account' },
  { key: 'bank_close', label: 'Bank — close / transfer to estate account' },
  { key: 'payoff', label: 'Lender — request payoff balance' },
  { key: 'lender_statements', label: 'Lender — request loan statements' },
  { key: 'insurance_claim', label: 'Insurance — file a claim' },
  { key: 'insurance_info', label: 'Insurance — request policy info' },
  { key: 'insurance_cancel', label: 'Insurance — cancel policy / request refund' },
  { key: 'employer', label: 'Employer — final pay & benefits' },
  { key: 'creditor_notify', label: 'Creditor / card — notify of death, request balance' },
  { key: 'utility_cancel', label: 'Utility / subscription — cancel' },
  { key: 'utility_transfer', label: 'Utility / service — transfer or update' },
  { key: 'final_bill', label: 'Request a final bill / balance' },
  { key: 'refund_deposit', label: 'Request a refund or deposit return' },
  { key: 'govt_inquiry', label: 'Government agency — inquiry / benefits' },
  { key: 'realtor', label: 'Real estate — appraisal / sale inquiry' },
  { key: 'hoa_notify', label: 'HOA / property manager — notify of death' },
  { key: 'business', label: 'Business — notify partners / request records' },
  { key: 'records_request', label: 'Request records / documents' },
  { key: 'cancel_service', label: 'Cancel a service / subscription' },
  { key: 'heir_update', label: 'Heir — send an update' },
  { key: 'thank_you', label: 'Thank-you / acknowledgment' },
  { key: 'general', label: 'Something else (describe it)' },
]

// Ask the AI to draft an estate email. Returns { subject, body } for the
// executor to edit before sending. Nothing is sent here.
export async function draftEmail({ estateId, contactName, contactRole, intent, instruction }) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/draft-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estateId, contactName, contactRole, intent, instruction }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || 'Could not draft the email')
  return data
}

// Send an estate email through the app (Brevo). It's captured on the contact's
// communications timeline automatically. Returns { interaction }.
export async function sendEstateEmail({ estateId, contactId, to, cc, bcc, subject, body, isPrivate }) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/send-estate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estateId, contactId, to, cc, bcc, subject, body, isPrivate }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || 'Could not send the email')
  return data
}

// Communication channels we capture. Keep keys stable; labels/icons are for UI.
export const CHANNELS = {
  phone:     { label: 'Phone call', icon: '📞' },
  email:     { label: 'Email',      icon: '✉️' },
  text:      { label: 'Text / SMS', icon: '💬' },
  letter:    { label: 'Letter / mail', icon: '📬' },
  in_person: { label: 'In person',  icon: '🤝' },
  document:  { label: 'Documents sent', icon: '📎' },
  other:     { label: 'Other',      icon: '•' },
}
export const channelLabel = c => CHANNELS[c]?.label ?? 'Note'
export const channelIcon = c => CHANNELS[c]?.icon ?? '•'

// The domain estate inbound addresses live on. When receiving (Amazon SES) is
// live, set INBOUND_LIVE = true here AND set the INBOUND_EMAIL_DOMAIN Netlify
// env var to the same value (so reply-to uses the per-estate inbox).
export const INBOUND_EMAIL_DOMAIN = 'in.settlewellestate.com'
export const INBOUND_LIVE = true // SES receiving configured (settlewellestate.com)
// An estate's own email address (where replies and forwarded mail are captured)
// — only shown once inbound receiving is actually live.
export const estateInboxAddress = estate =>
  (INBOUND_LIVE && estate?.inbound_token) ? `${estate.inbound_token}@${INBOUND_EMAIL_DOMAIN}` : null

// Permanently delete a logged/captured communication (executor only).
export async function deleteCommunication(id) {
  const { error } = await supabase.from('estate_contact_interactions').delete().eq('id', id)
  if (error) throw error
}

// Record a communication with a contact. Used both by the manual "Log
// communication" form and by auto-capture when the app sends something
// (attorney packets, death notices, texts) so nothing has to be remembered.
// Returns the inserted row (or null on failure — auto-capture must never break
// the action it's attached to).
export async function logCommunication({
  estateId, contactId, direction = 'outbound', channel = 'other',
  summary, subject = null, source = 'manual', occurredAt = null, linkedTaskId = null,
}) {
  if (!estateId || !contactId || !summary?.trim()) return null
  try {
    const { data, error } = await supabase.from('estate_contact_interactions').insert({
      estate_id: estateId,
      contact_id: contactId,
      direction,
      channel,
      summary: summary.trim(),
      subject: subject?.trim() || null,
      source,
      occurred_at: occurredAt || new Date().toISOString(),
      linked_task_id: linkedTaskId,
    }).select().single()
    if (error) throw error
    return data
  } catch (e) {
    console.warn('logCommunication failed:', e?.message)
    return null
  }
}
