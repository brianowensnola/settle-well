import { supabase } from './supabase'

const BUCKET = 'estate-documents'
const sanitize = n => n.replace(/[^a-zA-Z0-9._-]/g, '_')

export async function loadInbox() {
  const { data } = await supabase
    .from('family_mail')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

// Upload one mail file to the shared inbox, then ask the AI router to suggest
// which estate it belongs to. Returns the created row id.
export async function uploadMailFile(file, user) {
  const path = `family-mail/${Date.now()}_${sanitize(file.name)}`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file)
  if (upErr) throw upErr

  const { data, error } = await supabase.from('family_mail').insert({
    uploaded_by: user?.id ?? null,
    uploader_name: user?.email ?? null,
    file_path: path,
    original_name: file.name,
    ai_name: file.name,
  }).select().single()
  if (error) throw error

  // Best-effort AI routing (non-fatal — item still appears for manual routing).
  try {
    await fetch('/.netlify/functions/mail-router', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailId: data.id }),
    })
  } catch { /* ignore */ }

  return data.id
}

export async function signedUrl(filePath) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600)
  return data?.signedUrl ?? null
}

// Approve: file the mail under the chosen estate. The file stays where it is
// (bucket reads are estate-wide); we just create the estate's document record
// pointing at it and link it to that estate's mail-review task.
export async function routeMailItem(item, estateId, overrideName) {
  const name = (overrideName ?? item.ai_name ?? item.original_name ?? 'Mail item').trim()

  const { data: doc, error } = await supabase.from('estate_documents').insert({
    estate_id: estateId,
    name,
    doc_type: item.ai_doc_type || 'mail',
    file_path: item.file_path,
    have: true,
    notes: item.ai_summary || null,
  }).select().single()
  if (error) throw error

  // Link to (or create) that estate's daily mail-review task.
  const today = new Date().toISOString().split('T')[0]
  const taskName = `Review mail from ${new Date(today + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  let { data: task } = await supabase.from('estate_tasks')
    .select('id').eq('estate_id', estateId).eq('text', taskName).eq('status', 'pending').maybeSingle()
  if (!task) {
    const { data: sec } = await supabase.from('estate_sections')
      .select('id').eq('estate_id', estateId).eq('label', 'Phase 2 — First Week').maybeSingle()
    const { data: newTask } = await supabase.from('estate_tasks').insert({
      estate_id: estateId, section_id: sec?.id ?? null, text: taskName,
      status: 'pending', tag: 'mail-review', detail: 'Review newly filed mail and decide what actions to take.',
    }).select('id').single()
    task = newTask
  }
  if (task) await supabase.from('estate_documents').update({ linked_task_id: task.id }).eq('id', doc.id)

  await supabase.from('family_mail').update({
    status: 'routed', routed_estate_id: estateId, routed_document_id: doc.id,
  }).eq('id', item.id)

  return doc
}

export async function dismissMailItem(item) {
  await supabase.from('family_mail').update({ status: 'dismissed' }).eq('id', item.id)
  // Dismissed mail was never filed under an estate, so purge its file (best-effort).
  if (item.file_path) { try { await supabase.storage.from(BUCKET).remove([item.file_path]) } catch { /* ignore */ } }
}
