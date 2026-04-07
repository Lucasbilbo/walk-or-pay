import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const POLL_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export function useSteps(enabled = true) {
  const [steps, setSteps] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const intervalRef = useRef(null)

  const refetch = useCallback(async () => {
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
  }, [enabled])

  useEffect(() => {
    refetch()
    intervalRef.current = setInterval(refetch, POLL_INTERVAL_MS)
    return () => clearInterval(intervalRef.current)
  }, [refetch])

  return { steps, loading, error, refetch }
}
