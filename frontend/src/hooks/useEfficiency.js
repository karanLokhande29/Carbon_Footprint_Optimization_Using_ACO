import { useState, useEffect } from 'react'
import { fetchEfficiency } from '../api/client'

/**
 * Hook to fetch efficiency data from GET /efficiency.
 *
 * Returns:
 *   models   — array of model objects with green_score, efficiency_score, etc.
 *   summary  — { best_accuracy, most_efficient, best_tradeoff, fastest }
 *   loading  — boolean
 *   error    — string | null
 */
export function useEfficiency() {
  const [models, setModels]   = useState([])
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    fetchEfficiency()
      .then(data => {
        if (cancelled) return
        setModels(data.models ?? [])
        setSummary(data.summary ?? null)
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return { models, summary, loading, error }
}
