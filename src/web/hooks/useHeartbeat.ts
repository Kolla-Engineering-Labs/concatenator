import { useEffect, useState, useRef } from 'react'
import { ApiClient } from '../services/ApiClient'
import { logger } from '../../lib/logger'

export function useHeartbeat(interval: number = 60000) {
  const [isExpired, setIsExpired] = useState(false)
  // null  = first check not yet complete ("Checking…")
  // true  = last heartbeat succeeded ("Connected")
  // false = server unreachable or session lost
  const [isConnected, setIsConnected] = useState<boolean | null>(null)
  // true once we've had at least one successful heartbeat
  const [wasEverConnected, setWasEverConnected] = useState(false)
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

      // No token means server is unreachable (dev mode or CLI not running)
      if (!tokenRef.current) {
        setIsConnected(false)
        return
      }

      try {
        await ApiClient.sendHeartbeat(tokenRef.current)
        setIsExpired(false)
        setIsConnected(true)
        setWasEverConnected(true)
      } catch {
        // Only set expired if it's a 404 or connection error
        // We'll let usePulseMonitor handle the fallback logic
        setIsExpired(true)
        setIsConnected(false)
      }
    }

    const timer = setInterval(check, interval)
    check()

    return () => clearInterval(timer)
  }, [interval])

  return { isExpired, setIsExpired, isConnected, wasEverConnected }
}
