import { supabase, getAccessToken } from './supabase'

// Common estate emails the app can draft for you. Keys map to the server's
// INTENTS in draft-email.js.
export const EMAIL_INTENTS = [
  { key: 'attorney_status', label: 'Attorney — status / follow-up' },
  { key: 'bank_balances', label: 'Bank — request date-of-death balance' },
  { key: 'payoff', label: 'Lender — request payoff balance' },
  { key: 'insurance_claim', label: 'Insurance — how to file a claim' },
  { key: 'records_request', label: 'Request records / documents' },
  { key: 'cancel_service', label: 'Cancel a service / subscription' },
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
export async function sendEstateEmail({ estateId, contactId, to, subject, body, isPrivate }) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/send-estate-email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estateId, contactId, to, subject, body, isPrivate }),
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
