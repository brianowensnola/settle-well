import { supabase, getAccessToken } from './supabase'

// Load everyone across the given estates, grouped into one entry per person
// (keyed by email, falling back to name). Each person carries their per-estate
// memberships (with role) plus shared demographics.
export async function loadPeople(estateIds) {
  if (!estateIds?.length) return []
  const { data } = await supabase.from('estate_users').select('*').in('estate_id', estateIds)
  const groups = {}
  for (const r of (data ?? [])) {
    const key = (r.email || r.name || r.id).toLowerCase()
    if (!groups[key]) {
      groups[key] = {
        key, name: r.name, email: r.email,
        phone: r.phone, address: r.address, relationship: r.relationship,
        auth_user_id: r.auth_user_id, memberships: [],
      }
    }
    groups[key].memberships.push(r)
    if (r.auth_user_id) groups[key].auth_user_id = r.auth_user_id
    // fill demographics from whichever row has them
    for (const f of ['name', 'phone', 'address', 'relationship']) {
      if (!groups[key][f] && r[f]) groups[key][f] = r[f]
    }
  }
  return Object.values(groups).sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''))
}

export async function updateRole(rowId, role) {
  await supabase.from('estate_users').update({ role }).eq('id', rowId)
}

export async function removeMembership(rowId) {
  const { error } = await supabase.from('estate_users').delete().eq('id', rowId)
  if (error) throw error
}

// Remove a person from every estate at once (deletes all their membership rows).
// Does not delete their auth login — that's managed separately.
export async function removePerson(membershipIds) {
  if (!membershipIds?.length) return
  const { error } = await supabase.from('estate_users').delete().in('id', membershipIds)
  if (error) throw error
}

// Add a person to an estate. If they already have a login (auth_user_id), link
// it so they get access immediately; otherwise it's a pending invite by email.
export async function addMembership(estateId, person, role) {
  const { data } = await supabase.from('estate_users').insert({
    estate_id: estateId,
    name: person.name || (person.email ? person.email.split('@')[0] : null),
    email: person.email || null,
    role,
    auth_user_id: person.auth_user_id || null,
    phone: person.phone || null,
    address: person.address || null,
    relationship: person.relationship || null,
  }).select().single()
  return data
}

// Update demographics on every membership row for this person.
export async function updateDemographics(membershipIds, fields) {
  await supabase.from('estate_users')
    .update({
      name: fields.name ?? null,
      email: fields.email ?? null,
      phone: fields.phone ?? null,
      address: fields.address ?? null,
      relationship: fields.relationship ?? null,
    })
    .in('id', membershipIds)
}

// Executor-only: send a sign-up invitation (email + optional SMS) to a person.
// Returns { email: {sent, error?}, sms: {sent, error?}|null }.
export async function sendInvite({ email, name, phone, estateName }) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/send-invite', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, name, phone, estateName }),
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) throw new Error(data.error || 'Invite failed')
  return data
}

// Executor-only password reset via the secured server function.
export async function resetPassword(targetUserId, newPassword) {
  const token = await getAccessToken()
  const resp = await fetch('/.netlify/functions/admin-set-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetUserId, newPassword }),
  })
  if (!resp.ok) {
    const { error } = await resp.json().catch(() => ({ error: 'request failed' }))
    throw new Error(error || 'Password reset failed')
  }
  return true
}
