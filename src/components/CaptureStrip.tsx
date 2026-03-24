import { useState, useRef, useCallback } from 'react'
import { captureToInbox } from '@/lib/capture'
import type { WorkGraph } from '@/types/graph'

interface CaptureStripProps {
  graph: WorkGraph | null
  activeProject?: string
  onCaptured?: () => void
}

export function CaptureStrip({ graph, activeProject, onCaptured }: CaptureStripProps) {
  const [text, setText] = useState('')
  const [flash, setFlash] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter') return
      const trimmed = text.trim()
      if (!trimmed || !graph) return

      // Clear input immediately
      setText('')

      // Trigger capture (non-blocking — fire and forget)
      captureToInbox(trimmed, graph, activeProject).catch((err) => {
        console.error('[CaptureStrip] captureToInbox failed:', err)
      })

      // Green flash feedback
      setFlash(true)
      setTimeout(() => setFlash(false), 500)

      // Notify parent
      onCaptured?.()
    },
    [text, graph, activeProject, onCaptured],
  )

  return (
    <input
      ref={inputRef}
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder="Capture a thought, task, or decision… Enter to save"
      className={[
        'border rounded-lg px-4 py-3 w-full focus:outline-none focus:ring-2 focus:ring-blue-500',
        'transition-colors duration-200',
        flash ? 'border-green-500' : 'border-gray-200',
      ].join(' ')}
    />
  )
}
