import { supabase } from './supabase'
import { logCommunication } from './communications'
import { DOC_TYPES } from './constants'

const LINK_TTL_SECONDS = 7 * 24 * 60 * 60 // secure links expire in 7 days

export const nameFromEmail = (email) => {
  const local = (email || '').split('@')[0] || ''
  const parts = local.split(/[._-]+/).filter(Boolean)
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || (email || 'Contact')
}

// Send documents to a recipient: resolve or auto-create the contact, make 7-day
// signed download links, record the send (attorney_document_sends) + a
// communication (channel 'document'), and return a mailto href to open. Shared
// by the Communications page and the contact-card in-place panel so behavior
// can't drift. Nothing UI-specific here.
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

  const paths = docs.map(d => d.file_path)
  const { data: signed, error } = await supabase.storage.from('estate-documents').createSignedUrls(paths, LINK_TTL_SECONDS)
  if (error) throw error
  const byPath = Object.fromEntries((signed ?? []).map(r => [r.path, r.signedUrl]))

  const lines = [`Documents for the ${estateName} estate`, '']
  if (note.trim()) { lines.push(note.trim()); lines.push('') }
  docs.forEach((d, i) => {
    lines.push(`${i + 1}. ${d.name} (${DOC_TYPES[d.doc_type] ?? d.doc_type})`)
    lines.push(`   ${byPath[d.file_path] || '[link unavailable]'}`)
  })
  lines.push(''); lines.push('These secure download links expire in 7 days.')
  const subject = `Documents — ${estateName} Estate`

  await supabase.from('attorney_document_sends').insert({
    estate_id: estateId,
    document_ids: docs.map(d => d.id),
    document_count: docs.length,
    document_names: docs.map(d => d.name).join(', '),
    sent_at: new Date().toISOString(),
    recipient_name: `${recipientName} <${email}>`,
  })
  const interaction = await logCommunication({
    estateId, contactId: recipientContactId, direction: 'outbound', channel: 'document',
    subject: `Sent ${docs.length} document${docs.length !== 1 ? 's' : ''}`,
    summary: `Sent to ${recipientName} (${email})${cc.trim() ? ` (cc: ${cc.trim()})` : ''}: ${docs.map(d => d.name).join(', ')}${note.trim() ? ` — “${note.trim()}”` : ''}`,
    source: 'auto',
  })

  const params = [`subject=${encodeURIComponent(subject)}`, `body=${encodeURIComponent(lines.join('\n'))}`]
  if (cc.trim()) params.unshift(`cc=${encodeURIComponent(cc.trim())}`)
  if (bcc.trim()) params.unshift(`bcc=${encodeURIComponent(bcc.trim())}`)
  return { mailtoHref: `mailto:${encodeURIComponent(email)}?${params.join('&')}`, interaction, createdContact }
}
