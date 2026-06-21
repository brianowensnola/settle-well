import { supabase } from './supabase'

// Other estates in the same family group — candidates for joint/move.
export function familySiblings(estates, estate) {
  if (!estate) return []
  return (estates ?? []).filter(e => e.id !== estate.id && (estate.group_id ? e.group_id === estate.group_id : false))
}

// Set which estates an asset is shared (joint) with.
export async function setAssetSharedWith(assetId, sharedWith) {
  const { error } = await supabase.from('estate_financials').update({ shared_with: sharedWith }).eq('id', assetId)
  if (error) throw error
}

// Move an asset to another estate: its attached documents move with it, and any
// linked tasks are re-filed into the matching phase on the target estate.
export async function moveAssetToEstate(asset, targetId) {
  const { data: linkedTasks } = await supabase.from('estate_tasks')
    .select('id, section_id').eq('linked_financial_id', asset.id)
  if (linkedTasks?.length) {
    const [{ data: srcSec }, { data: tgtSec }] = await Promise.all([
      supabase.from('estate_sections').select('id, label').eq('estate_id', asset.estate_id),
      supabase.from('estate_sections').select('id, label').eq('estate_id', targetId),
    ])
    const labelBySrc = Object.fromEntries((srcSec ?? []).map(s => [s.id, s.label]))
    const idByLabel = Object.fromEntries((tgtSec ?? []).map(s => [s.label, s.id]))
    for (const t of linkedTasks) {
      await supabase.from('estate_tasks').update({
        estate_id: targetId, section_id: idByLabel[labelBySrc[t.section_id]] ?? null,
        updated_at: new Date().toISOString(),
      }).eq('id', t.id)
    }
  }
  // Attached documents move with the asset.
  await supabase.from('estate_documents').update({ estate_id: targetId }).eq('asset_id', asset.id)
  // Move the asset; drop the target from shared_with (can't be joint with its own estate).
  const newShared = (asset.shared_with || []).filter(x => x !== targetId)
  const { error } = await supabase.from('estate_financials')
    .update({ estate_id: targetId, shared_with: newShared }).eq('id', asset.id)
  if (error) throw error
}
