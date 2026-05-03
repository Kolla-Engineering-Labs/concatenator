import { useEffect, useState, useRef } from 'react'
import { ApiClient } from '../services/ApiClient'
import { logger } from '../../lib/logger'

export function useHeartbeat(interval: number = 60000) {
  const [isExpired, setIsExpired] = useState(false)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await ApiClient.getConfig()
        if (config.token) {
          tokenRef.current = config.token
        }
      } catch (e) {
        logger.error(`Failed to fetch config for heartbeat: ${e}`)
      }
    }

    const check = async () => {
      if (!tokenRef.current) {
        await fetchConfig()
      }
      if (!tokenRef.current) return

      try {
        await ApiClient.sendHeartbeat(tokenRef.current)
        setIsExpired(false)
      } catch {
        // Only set expired if it's a 404 or connection error
        // We'll let usePulseMonitor handle the fallback logic
        setIsExpired(true)
      }
    }

    const timer = setInterval(check, interval)
    check()

    return () => clearInterval(timer)
  }, [interval])

  return { isExpired, setIsExpired }
}
