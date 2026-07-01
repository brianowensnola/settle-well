import { supabase } from './supabase'
import { sendEstateEmail } from './communications'

export const nameFromEmail = (email) => {
  const local = (email || '').split('@')[0] || ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || (email || 'Contact')
}

// Send documents to a recipient THROUGH THE APP (Brevo, with the actual files
// attached — no external mail app). Resolves or auto-creates the contact,
// records the send (attorney_document_sends), and sends via send-estate-email,
// which attaches the files and logs the outbound communication. Shared by the
// Communications page and the contact-card in-place panel so behavior can't drift.
export async function buildDocumentSend({ estateId, estateName, to, docs, note = '', cc = '', bcc = '' }) {
  const email = (to || '').trim()
  if (!email || !docs?.length) throw new Error('Enter a recipient email and choose at least one document.')

  // Resolve or auto-create the recipient contact in this estate.
  const { data: cands } = await supabase.from('estate_contacts').select('id, name, email, emails').eq('estate_id', estateId)
  const match = (cands ?? []).find(c => [c.email, ...(c.emails || [])].some(e => (e || '').toLowerCase() === email.toLowerCase()))
  const recipientName = match?.name || nameFromEmail(email)
  let recipientContactId = match?.id || null
  let createdContact = null
  if (!recipientContactId) {
    const { data: newC, error } = await supabase.from('estate_contacts')
      .insert({ estate_id: estateId, name: recipientName, role: 'other', emails: [email] }).select().single()
    if (error) throw error
    recipientContactId = newC?.id || null
    createdContact = newC
  }

  // Record the send (drives the heir-facing "Documents sent" view).
  await supabase.from('attorney_document_sends').insert({
    estate_id: estateId,
    document_ids: docs.map(d => d.id),
    document_count: docs.length,
    document_names: docs.map(d => d.name).join(', '),
    sent_at: new Date().toISOString(),
    recipient_name: `${recipientName} <${email}>`,
  })

  // Send through the app with the files attached; send-estate-email logs it.
  const first = recipientName ? ` ${recipientName.split(' ')[0]}` : ''
  const bodyLines = [`Hello${first},`, '']
  bodyLines.push(note.trim() || `Please find the attached document${docs.length !== 1 ? 's' : ''} for the ${estateName} estate.`)
  bodyLines.push('', 'Attached:')
  docs.forEach((d, i) => bodyLines.push(`  ${i + 1}. ${d.name}`))
  const { interaction } = await sendEstateEmail({
    estateId, contactId: recipientContactId, to: email, cc, bcc,
    subject: `Documents — ${estateName} Estate`, body: bodyLines.join('\n'), docIds: docs.map(d => d.id),
  })
  return { interaction, createdContact }
}
