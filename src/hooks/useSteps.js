import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function useSteps(enabled = true, logSteps = null) {
  const [steps, setSteps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  // Sync logSteps into state whenever it changes (e.g. iOS shortcut updated the log)
  useEffect(() => {
    if (logSteps > 0) {
      setSteps(logSteps)
      setLoading(false)
    }
  }, [logSteps])

  const refetch = useCallback(async () => {
    // If today's log already has steps, no need to call Google Fit
    if (logSteps > 0) {
      setSteps(logSteps)
      setLoading(false)
      return
    }
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setLoading(false)
        return
      }
      const today = new Date().toISOString().split('T')[0]
      const res = await fetch(`/.netlify/functions/get-steps?date=${today}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to fetch steps')
      setSteps(data.steps)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [enabled, logSteps])

  useEffect(() => {
    refetch()
    intervalRef.current = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [refetch])

  return { steps, loading, error, refetch }
}
