import { useState, useEffect } from 'react'

/**
 * Debounce sebuah value — berguna untuk search input agar tidak
 * memfilter pada setiap keystroke.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
