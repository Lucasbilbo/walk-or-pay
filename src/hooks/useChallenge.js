import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useChallenge(userId) {
  const [challenge, setChallenge] = useState(null)
  const [dailyLogs, setDailyLogs] = useState([])
  const [loading, setLoading] = useState(true)

  const refetch = useCallback(async () => {
    if (!userId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // .maybeSingle() — never .single() (single throws on 0 rows)
      const { data: challengeData, error: challengeErr } = await supabase
        .from('challenges')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'pending_payment'])
        .order('created_at', { ascending: false })
        .maybeSingle()

      if (challengeErr) throw challengeErr
      setChallenge(challengeData)

      if (challengeData) {
        const { data: logs, error: logsErr } = await supabase
          .from('daily_logs')
          .select('*')
          .eq('challenge_id', challengeData.id)
          .order('date', { ascending: true })
        if (logsErr) throw logsErr
        setDailyLogs(logs || [])
      } else {
        setDailyLogs([])
      }
    } catch (err) {
      console.error('[useChallenge] Error:', err.message)
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    refetch()
  }, [refetch])

  return { challenge, dailyLogs, loading, refetch }
}
