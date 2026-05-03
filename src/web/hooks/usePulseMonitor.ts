import { useEffect, useState, useRef } from 'react'
import { ApiClient } from '../services/ApiClient'

export function usePulseMonitor(heartbeatExpired: boolean) {
  const [isHeavyProcessing, setIsHeavyProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const lastTsRef = useRef<number>(0)

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined

    const checkPulse = async () => {
      try {
        const data = await ApiClient.getPulse()
        if (data.active && data.ts > lastTsRef.current) {
          setIsHeavyProcessing(true)
          setProgress(data.progress)
          lastTsRef.current = data.ts

          // Update localStorage
          localStorage.setItem(
            'concatenator_last_job',
            JSON.stringify({
              op: data.op,
              progress: data.progress,
              ts: data.ts,
            })
          )
        } else if (!data.active) {
          setIsHeavyProcessing(false)
        }
      } catch {
        // Fallback: if we can't even get pulse, then it's really dead
        setIsHeavyProcessing(false)
      }
    }

    // Always check pulse if heartbeat is failing,
    // or periodically if we want to show progress even when heartbeat is fine.
    // The requirement says: "If the standard 'POST /api/heartbeat' fails, fall back to 'GET /api/pulse'."
    if (heartbeatExpired) {
      interval = setInterval(checkPulse, 2000)
      checkPulse()
    } else {
      setIsHeavyProcessing(false)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [heartbeatExpired])

  return { isHeavyProcessing, progress }
}
