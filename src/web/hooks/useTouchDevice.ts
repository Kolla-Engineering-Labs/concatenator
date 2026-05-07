/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react'

/**
 * A hook that detects if the device has a coarse pointer (touch device).
 * @returns boolean indicating if it's a touch device
 */
export const useTouchDevice = () => {
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)')

    // Set initial value
    setIsTouchDevice(mediaQuery.matches)

    // Listen for changes
    const handler = (e: MediaQueryListEvent) => setIsTouchDevice(e.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [])

  return isTouchDevice
}
