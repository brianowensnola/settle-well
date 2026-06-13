import { supabase } from './supabase'

// Kick off an advisor run (background function) and poll for the new
// suggestions it produces. mode: 'review' | 'forensic'.
export async function runAdvisor(estateId, mode = 'review', filePaths = []) {
  const since = new Date().toISOString()
  const resp = await fetch('/.netlify/functions/ai-advisor-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estateId, mode, filePaths }),
  })
  if (!resp.ok) throw new Error('Advisor request failed')

  const maxWait = 150000, interval = 2500, start = Date.now()
  while (Date.now() - start < maxWait) {
    const { data } = await supabase
      .from('estate_ai_suggestions')
      .select('*')
      .eq('estate_id', estateId)
      .gt('created_at', since)
      .order('created_at')
    if (data && data.length > 0) return data
    await new Promise(r => setTimeout(r, interval))
  }
  return [] // timed out, or the run found nothing to suggest
}

export async function loadSuggestions(estateId) {
  const { data } = await supabase
    .from('estate_ai_suggestions')
    .select('*')
    .eq('estate_id', estateId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

export async function dismissSuggestion(id) {
  await supabase.from('estate_ai_suggestions').update({ status: 'dismissed' }).eq('id', id)
}

// Accept a suggestion → create a real task in the suggested phase, mark accepted.
export async function acceptSuggestion(s) {
  let section_id = null
  if (s.suggested_phase) {
    const { data: sec } = await supabase
      .from('estate_sections')
      .select('id')
      .eq('estate_id', s.estate_id)
      .eq('label', s.suggested_phase)
      .maybeSingle()
    section_id = sec?.id ?? null
  }
  const { data: task } = await supabase.from('estate_tasks').insert({
    estate_id: s.estate_id,
    section_id,
    text: s.title,
    detail: s.detail,
    tag: s.kind === 'forensic' ? 'AI · forensic' : 'AI · suggested',
    status: 'pending',
    is_private: s.is_private,
  }).select().single()
  await supabase.from('estate_ai_suggestions')
    .update({ status: 'accepted', created_task_id: task?.id ?? null })
    .eq('id', s.id)
  return task
}
