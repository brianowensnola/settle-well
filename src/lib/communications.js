import { supabase } from './supabase'

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
