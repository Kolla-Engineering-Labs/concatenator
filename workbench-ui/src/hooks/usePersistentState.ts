import { useState, useEffect } from 'react'

export function usePersistentState<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      return item ? JSON.parse(item) : initialValue
    } catch (error) {
      console.warn(
        `[KEL Protocol] Persistence layer read failure for key "${key}":`,
        error
      )
      return initialValue
    }
  })

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state))
    } catch (error) {
      console.warn(
        `[KEL Protocol] Persistence layer write failure for key "${key}":`,
        error
      )
    }
  }, [key, state])

  return [state, setState]
}
