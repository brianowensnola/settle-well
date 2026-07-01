import { supabase } from './supabase'
import { CONTACT_ROLES } from './constants'

// Manageable contact roles (see contact_roles table). Falls back to the built-in
// list if the table is empty/unavailable so the app never loses its role options.
export async function loadContactRoles() {
  const { data, error } = await supabase.from('contact_roles').select('key, label, sort_order').order('sort_order')
  if (error || !data || data.length === 0) {
    return Object.entries(CONTACT_ROLES).map(([key, label]) => ({ key, label }))
  }
  return data.map(r => ({ key: r.key, label: r.label }))
}

export async function addContactRole(label) {
  const clean = (label || '').trim()
  if (!clean) throw new Error('Enter a role name')
  const key = clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (!key) throw new Error('Enter a valid role name')
  const { error } = await supabase.from('contact_roles').insert({ key, label: clean })
  if (error) throw error
  return { key, label: clean }
}

export async function removeContactRole(key) {
  const { error } = await supabase.from('contact_roles').delete().eq('key', key)
  if (error) throw error
}

// {key: label} lookup for displaying a contact's role.
export const roleLabelMap = (roles) => Object.fromEntries((roles || []).map(r => [r.key, r.label]))
