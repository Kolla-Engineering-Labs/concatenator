import { useState, useEffect } from 'react'

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key)
      if (!item) return initialValue
      try {
        const parsed = JSON.parse(item)
        // Type guard: If initialValue is not a string/number/boolean (i.e., an object or array),
        // and parsed is not an object, it's likely corrupted or legacy data.
        if (
          typeof initialValue !== 'string' &&
          typeof initialValue !== 'number' &&
          typeof initialValue !== 'boolean' &&
          (parsed === null || typeof parsed !== 'object')
        ) {
          return initialValue
        }
        return parsed as T
      } catch {
        // If parsing fails, only return the raw item if T is expected to be a string
        if (typeof initialValue === 'string') {
          return item as unknown as T
        }
        return initialValue
      }
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error)
      return initialValue
    }
  })

  useEffect(() => {
    try {
      const valueToStore =
        typeof storedValue === 'string'
          ? storedValue
          : JSON.stringify(storedValue)
      window.localStorage.setItem(key, valueToStore)
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error)
    }
  }, [key, storedValue])

  return [storedValue, setStoredValue] as const
}
