import { createContext, useContext, useEffect, useReducer } from 'react'
import { fetchHealth, fetchLeaderboard } from '../api/client'

const Ctx = createContext(null)

const init = { health: null, leaderboard: [], lbLoading: true, lbError: null }

function reducer(s, a) {
  switch (a.type) {
    case 'HEALTH':     return { ...s, health: a.payload }
    case 'LB_OK':      return { ...s, leaderboard: a.payload, lbLoading: false }
    case 'LB_ERR':     return { ...s, lbError: a.payload, lbLoading: false }
    default:           return s
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, init)

  // Leaderboard — fetch once (models are frozen, data never changes)
  useEffect(() => {
    fetchLeaderboard()
      .then(d => dispatch({ type: 'LB_OK', payload: d.entries }))
      .catch(e => dispatch({ type: 'LB_ERR', payload: e.message }))
  }, [])

  // Health — poll every 30 s
  useEffect(() => {
    const poll = () =>
      fetchHealth()
        .then(d => dispatch({ type: 'HEALTH', payload: d }))
        .catch(() => dispatch({ type: 'HEALTH', payload: null }))
    poll()
    const id = setInterval(poll, 30_000)
    return () => clearInterval(id)
  }, [])

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>
}

export const useApp = () => useContext(Ctx)
