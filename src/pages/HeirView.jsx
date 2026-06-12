import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useEstate } from '../lib/EstateContext'

export default function HeirView() {
  const { currentEstate } = useEstate()
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentEstate) return
    supabase.from('estate_heir_todos').select('*').eq('estate_id', currentEstate.id).order('sort_order')
      .then(({ data }) => { setTodos(data ?? []); setLoading(false) })
  }, [currentEstate])

  async function toggleTodo(todo) {
    const next = todo.status === 'done' ? 'pending' : 'done'
    await supabase.from('estate_heir_todos').update({ status: next, updated_at: new Date().toISOString() }).eq('id', todo.id)
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, status: next } : t))
  }

  if (!currentEstate) return <div className="p-8 text-gray-400">No estate.</div>
  if (loading) return <div className="p-8 text-gray-400">Loading...</div>

  const pending = todos.filter(t => t.status !== 'done')
  const done = todos.filter(t => t.status === 'done')

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto w-full">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{currentEstate.name}</h1>
        <p className="text-sm text-gray-500 mt-1">Heir view — your to-do list from Brian</p>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 dark:bg-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Your Action Items ({pending.length} pending)</span>
        </div>
        {pending.length === 0 && (
          <div className="px-4 py-4 text-sm text-gray-400">No pending items. Check back soon.</div>
        )}
        <div className="divide-y divide-gray-100">
          {pending.map(todo => (
            <div key={todo.id} className="px-4 py-4">
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTodo(todo)}
                  className="mt-0.5 w-5 h-5 rounded border-2 border-gray-300 shrink-0 hover:border-green-500 transition-colors"
                />
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-white">{todo.title}</div>
                  {todo.detail && <div className="text-sm text-gray-500 mt-1 leading-relaxed">{todo.detail}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {done.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 dark:bg-gray-800">
            <span className="text-sm font-semibold text-gray-500">Completed</span>
          </div>
          <div className="divide-y divide-gray-100">
            {done.map(todo => (
              <div key={todo.id} className="px-4 py-3 flex items-start gap-3">
                <button onClick={() => toggleTodo(todo)} className="mt-0.5 w-5 h-5 rounded bg-green-500 shrink-0 flex items-center justify-center">
                  <span className="text-white text-xs">✓</span>
                </button>
                <div className="text-sm text-gray-400 line-through">{todo.title}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
