import { supabase, getAccessToken } from './supabase'

// Executor-only: (re)generate the heir-facing progress update for an estate.
// Returns { digest, at }.
export async function generateHeirDigest(estateId) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/heir-digest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ estateId }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || 'Could not generate the update')
  return data
}

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

// Read one freshly-saved note and return any follow-up tasks it implies.
// Synchronous (short text), so we just await the response. Never throws — a
// note save must not fail because the suggestion step did.
export async function suggestTasksFromNote(estateId, content) {
  try {
    const resp = await fetch('/.netlify/functions/note-to-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estateId, content }),
    })
    if (!resp.ok) return []
    const { tasks } = await resp.json()
    return tasks ?? []
  } catch {
    return []
  }
}

// Create a task from a note suggestion (resolving its phase to a section).
export async function createTaskFromNote(estateId, t, isPrivate = false) {
  let section_id = null
  if (t.phase) {
    const { data: sec } = await supabase
      .from('estate_sections').select('id')
      .eq('estate_id', estateId).eq('label', t.phase).maybeSingle()
    section_id = sec?.id ?? null
  }
  const { data: task } = await supabase.from('estate_tasks').insert({
    estate_id: estateId,
    section_id,
    text: t.text,
    detail: t.detail || null,
    tag: 'AI · from note',
    status: 'pending',
    is_private: isPrivate,
  }).select().single()
  return task
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

// "I already did this" — the suggestion is a real, valid item the executor has
// already handled outside the app. Distinct from dismiss (not applicable): both
// stop it being re-suggested, but 'done' records it as completed in the log.
export async function markSuggestionDone(id) {
  await supabase.from('estate_ai_suggestions').update({ status: 'done' }).eq('id', id)
}

// Full disposition history for the Suggestion Log: everything that's been
// accepted, dismissed, or marked already-done (most recent first).
export async function loadSuggestionLog(estateId) {
  const { data } = await supabase
    .from('estate_ai_suggestions')
    .select('id, title, detail, kind, status, created_at')
    .eq('estate_id', estateId)
    .in('status', ['accepted', 'dismissed', 'done'])
    .order('created_at', { ascending: false })
    .limit(80)
  return data ?? []
}

// Put a dispositioned suggestion back into review (undo accept/dismiss/done).
export async function restoreSuggestion(id) {
  await supabase.from('estate_ai_suggestions').update({ status: 'pending' }).eq('id', id)
}

// Accept a suggestion. Document-link suggestions attach the doc to its task
// (and optionally update status); financial suggestions create a Finances entry;
// review/forensic suggestions create a task.
export async function acceptSuggestion(s) {
  // Task audit — merge duplicates or nest a group under a parent.
  if (s.kind === 'taskaudit') {
    const p = s.payload || {}
    if (s.action === 'merge' && p.keep_id && Array.isArray(p.remove_ids) && p.remove_ids.length) {
      // Preserve anything attached to the duplicates: reparent their sub-tasks,
      // move notes and the legacy doc link onto the kept task, then delete them.
      await supabase.from('estate_tasks').update({ parent_task_id: p.keep_id }).in('parent_task_id', p.remove_ids)
      await supabase.from('estate_task_logs').update({ task_id: p.keep_id }).in('task_id', p.remove_ids)
      await supabase.from('estate_documents').update({ linked_task_id: p.keep_id }).in('linked_task_id', p.remove_ids)
      await supabase.from('estate_task_documents').delete().in('task_id', p.remove_ids)
      await supabase.from('estate_tasks').delete().in('id', p.remove_ids)
    } else if (s.action === 'group' && p.parent_id && Array.isArray(p.child_ids) && p.child_ids.length) {
      await supabase.from('estate_tasks').update({ parent_task_id: p.parent_id, updated_at: new Date().toISOString() }).in('id', p.child_ids)
    }
    await supabase.from('estate_ai_suggestions').update({ status: 'accepted' }).eq('id', s.id)
    return null
  }

  if (s.kind === 'financial') {
    const { data: fin } = await supabase.from('estate_financials').insert({
      estate_id: s.estate_id,
      category: s.fin_category || 'account',
      name: s.title,
      amount: s.fin_amount ?? null,
      lender: s.fin_lender || null,
      status: s.fin_status || 'unknown',
      notes: s.detail || null,
      is_private: s.is_private,
    }).select().single()
    await supabase.from('estate_ai_suggestions')
      .update({ status: 'accepted', created_financial_id: fin?.id ?? null })
      .eq('id', s.id)
    return null
  }

  if (s.kind === 'documents' && s.link_task_id) {
    // Attach the document to the task
    if (s.link_document_id) {
      await supabase.from('estate_documents')
        .update({ linked_task_id: s.link_task_id })
        .eq('id', s.link_document_id)
    }
    // Update task status per the recommended action
    if (s.action === 'mark_done' || s.action === 'mark_in_progress') {
      await supabase.from('estate_tasks')
        .update({ status: s.action === 'mark_done' ? 'done' : 'in_progress', updated_at: new Date().toISOString() })
        .eq('id', s.link_task_id)
    }
    // Leave a trail on the task
    await supabase.from('estate_task_logs').insert({
      task_id: s.link_task_id,
      estate_id: s.estate_id,
      note: `Linked document via AI: ${s.title}`,
    })
    await supabase.from('estate_ai_suggestions')
      .update({ status: 'accepted', created_task_id: s.link_task_id })
      .eq('id', s.id)
    return null
  }

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
