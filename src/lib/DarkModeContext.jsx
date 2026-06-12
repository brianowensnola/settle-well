import { createContext, useContext, useEffect, useState } from 'react'

const DarkModeContext = createContext()

export function DarkModeProvider({ children }) {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('settle-well-dark-mode')
    if (saved !== null) return saved === 'true'
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  useEffect(() => {
    localStorage.setItem('settle-well-dark-mode', isDark)
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  return (
    <DarkModeContext.Provider value={{ isDark, setIsDark }}>
      {children}
    </DarkModeContext.Provider>
  )
}

export function useDarkMode() {
  const context = useContext(DarkModeContext)
  if (!context) throw new Error('useDarkMode must be used within DarkModeProvider')
  return context
}
