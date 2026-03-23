/**
 * useFileWatcher — Watch ~/twin/ recursively for file changes.
 *
 * Uses Tauri's debounced `watch` from @tauri-apps/plugin-fs.
 * The onChange callback is invoked (at most) once per debounce window.
 */

import { useEffect, useRef, useCallback } from 'react'
import { watch } from '@tauri-apps/plugin-fs'
import type { UnwatchFn } from '@tauri-apps/plugin-fs'
import { twinHome } from '@/lib/paths'

export function useFileWatcher(onChange: () => void, debounceMs = 500) {
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const stableOnChange = useCallback(() => {
    onChangeRef.current()
  }, [])

  useEffect(() => {
    let unwatchFn: UnwatchFn | null = null
    let cancelled = false

    async function startWatching() {
      try {
        const home = await twinHome()
        const unwatch = await watch(home, stableOnChange, {
          recursive: true,
          delayMs: debounceMs,
        })
        if (cancelled) {
          unwatch()
        } else {
          unwatchFn = unwatch
        }
      } catch (err) {
        console.error('[useFileWatcher] Failed to start watching:', err)
      }
    }

    startWatching()

    return () => {
      cancelled = true
      if (unwatchFn) {
        unwatchFn()
      }
    }
  }, [stableOnChange, debounceMs])
}
