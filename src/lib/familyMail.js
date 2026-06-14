import { jsPDF } from 'jspdf'
import { supabase } from './supabase'

const BUCKET = 'estate-documents'

export async function loadInbox() {
  const { data } = await supabase
    .from('family_mail')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return data ?? []
}

// --- image → PDF assembly (one scanned document per mailpiece) ---------------
function downscaleToDataUrl(file, maxDim = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      let { width, height } = img
      const scale = Math.min(1, maxDim / Math.max(width, height))
      width = Math.round(width * scale); height = Math.round(height * scale)
      const canvas = document.createElement('canvas')
      canvas.width = width; canvas.height = height
      canvas.getContext('2d').drawImage(img, 0, 0, width, height)
      URL.revokeObjectURL(url)
      resolve({ dataUrl: canvas.toDataURL('image/jpeg', 0.8), width, height })
    }
    img.onerror = reject
    img.src = url
  })
}

async function imagesToPdf(files) {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  for (let i = 0; i < files.length; i++) {
    const { dataUrl, width, height } = await downscaleToDataUrl(files[i])
    const ratio = Math.min(pageW / width, pageH / height)
    const dw = width * ratio, dh = height * ratio
    if (i > 0) pdf.addPage()
    pdf.addImage(dataUrl, 'JPEG', (pageW - dw) / 2, (pageH - dh) / 2, dw, dh)
  }
  return pdf.output('blob')
}

// Upload ONE mailpiece (envelope + pages) as a single combined PDF, then ask
// the AI router to read it. The collaborator never picks an estate.
export async function uploadMailPiece(files, dateReceived, user) {
  if (!files?.length) throw new Error('Add the envelope and at least one page first.')
  const onlyPdf = files.length === 1 && files[0].type === 'application/pdf'
  const blob = onlyPdf ? files[0] : await imagesToPdf(files)
  const path = `family-mail/${Date.now()}_mail.pdf`
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'application/pdf' })
  if (upErr) throw upErr

  const { data, error } = await supabase.from('family_mail').insert({
    uploaded_by: user?.id ?? null,
    uploader_name: user?.email ?? null,
    file_path: path,
    original_name: `Mail received ${dateReceived || new Date().toISOString().slice(0, 10)}`,
    ai_name: `Mail received ${dateReceived || new Date().toISOString().slice(0, 10)}`,
    date_received: dateReceived || new Date().toISOString().slice(0, 10),
  }).select().single()
  if (error) throw error

  try {
    await fetch('/.netlify/functions/mail-router', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mailId: data.id }),
    })
  } catch { /* non-fatal — item still appears for manual review */ }

  return data.id
}

export async function signedUrl(filePath) {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(filePath, 3600)
  return data?.signedUrl ?? null
}

// Open tasks across the executor's estates — to link a mailpiece to an existing one.
export async function loadOpenTasks(estateIds) {
  if (!estateIds?.length) return []
  const { data } = await supabase
    .from('estate_tasks')
    .select('id, text, estate_id, status')
    .in('estate_id', estateIds)
    .neq('status', 'done')
    .order('text')
  return data ?? []
}

// Executor approval: file the mailpiece under the chosen estate (as a mail
// document) and link it to that estate's mail-review task.
export async function routeMailItem(item, estateId, overrideName, ledger, taskOpt) {
  const name = (overrideName ?? item.ai_name ?? item.original_name ?? 'Mail item').trim()

  // If it's a bill the executor chose to record, add it to the Finances ledger.
  if (ledger?.add) {
    await supabase.from('estate_financials').insert({
      estate_id: estateId,
      category: ledger.category || 'obligation',
      name: item.sender ? `${item.sender} (from mail)` : name,
      amount: (ledger.amount === 0 || ledger.amount) ? Number(ledger.amount) : (item.bill_amount ?? null),
      status: 'active',
      is_private: false,
      notes: [item.ai_summary, item.bill_due ? `Due ${item.bill_due}` : null].filter(Boolean).join(' — ') || null,
    })
  }

  const { data: doc, error } = await supabase.from('estate_documents').insert({
    estate_id: estateId,
    name,
    doc_type: 'mail',
    file_path: item.file_path,
    have: true,
    notes: [item.sender ? `From: ${item.sender}` : null, item.ai_summary].filter(Boolean).join(' — ') || null,
  }).select().single()
  if (error) throw error

  // Decide which task this mailpiece links to.
  let taskId = null
  if (taskOpt?.mode === 'existing' && taskOpt.taskId) {
    taskId = taskOpt.taskId
  } else if (taskOpt?.mode === 'new') {
    const text = (taskOpt.newText || item.ai_action || `Follow up on mail: ${name}`).trim()
    const { data: sec } = await supabase.from('estate_sections')
      .select('id').eq('estate_id', estateId).eq('label', 'Phase 2 — First Week').maybeSingle()
    const { data: nt } = await supabase.from('estate_tasks').insert({
      estate_id: estateId, section_id: sec?.id ?? null, text,
      status: 'pending', tag: 'from mail', detail: item.ai_summary || null,
    }).select('id').single()
    taskId = nt?.id ?? null
  } else {
    // Default: link to (or create) that estate's daily mail-review task.
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
    taskId = task?.id ?? null
  }
  // Link the filed document to the chosen task (many-to-many + legacy single link).
  if (taskId) {
    await supabase.from('estate_task_documents').upsert({ estate_id: estateId, task_id: taskId, document_id: doc.id }, { onConflict: 'task_id,document_id' })
    await supabase.from('estate_documents').update({ linked_task_id: taskId }).eq('id', doc.id)
  }

  await supabase.from('family_mail').update({
    status: 'routed', routed_estate_id: estateId, routed_document_id: doc.id,
  }).eq('id', item.id)

  return doc
}

export async function dismissMailItem(item) {
  await supabase.from('family_mail').update({ status: 'dismissed' }).eq('id', item.id)
  if (item.file_path) { try { await supabase.storage.from(BUCKET).remove([item.file_path]) } catch { /* ignore */ } }
}
