import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useUser } from './AuthContext'

const EstateContext = createContext(null)

export function EstateProvider({ children }) {
  const user = useUser()
  const [estates, setEstates] = useState([])
  const [currentEstate, setCurrentEstate] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) { setLoading(false); return }
    loadEstates()
  }, [user])

  async function loadEstates() {
    setLoading(true)
    // Link any pending invites for this user's email to their account, so a
    // re-invited (or newly-invited) person connects automatically on login.
    try { await supabase.rpc('claim_my_invites') } catch { /* non-fatal */ }
    const { data: euRows } = await supabase
      .from('estate_users')
      .select('estate_id, role, estates(*)')
      .eq('auth_user_id', user.id)

    if (!euRows?.length) { setLoading(false); return }

    const list = euRows.map(r => ({ ...r.estates, _role: r.role }))
    setEstates(list)
    // Restore the last-selected estate so it doesn't snap back to the first one.
    let savedId = null
    try { savedId = localStorage.getItem('sw_current_estate') } catch { /* ignore */ }
    const active = list.find(e => e.id === savedId) ?? list.find(e => e.status === 'active') ?? list[0]
    setCurrentEstate(active)
    setRole(euRows.find(r => r.estate_id === active.id)?.role ?? null)
    setLoading(false)
  }

  function switchEstate(estate) {
    const eu = estates.find(e => e.id === estate.id)
    setCurrentEstate(estate)
    setRole(eu?._role ?? null)
    try { localStorage.setItem('sw_current_estate', estate.id) } catch { /* ignore */ }
  }

  return (
    <EstateContext.Provider value={{ estates, currentEstate, role, loading, switchEstate, reload: loadEstates }}>
      {children}
    </EstateContext.Provider>
  )
}

export const useEstate = () => useContext(EstateContext)
