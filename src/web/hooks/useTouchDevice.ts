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
    const pointerCoarse = window.matchMedia('(pointer: coarse)')
    const anyPointerCoarse = window.matchMedia('(any-pointer: coarse)')

    const updateStatus = () => {
      const hasHardwareTouch =
        typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

      setIsTouchDevice(
        pointerCoarse.matches || anyPointerCoarse.matches || hasHardwareTouch
      )
    }

    // Set initial value
    updateStatus()

    // Listen for changes
    pointerCoarse.addEventListener('change', updateStatus)
    anyPointerCoarse.addEventListener('change', updateStatus)

    return () => {
      pointerCoarse.removeEventListener('change', updateStatus)
      anyPointerCoarse.removeEventListener('change', updateStatus)
    }
  }, [])

  return isTouchDevice
}
