import { useState, useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function CaptureWindow() {
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Auto-focus the input when window becomes visible
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && text.trim()) {
      // Emit a Tauri event that the main window listens for
      const { emit } = await import('@tauri-apps/api/event')
      await emit('capture-submitted', { text: text.trim() })
      setText('')
      const win = getCurrentWindow()
      await win.hide()
    }
    if (e.key === 'Escape') {
      setText('')
      const win = getCurrentWindow()
      await win.hide()
    }
  }

  return (
    <div className="h-full flex items-center px-4 bg-white/95 backdrop-blur-sm rounded-xl shadow-2xl">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Capture a thought, task, or decision… Enter to save"
        className="w-full bg-transparent text-lg outline-none placeholder:text-gray-400"
        autoFocus
      />
    </div>
  )
}
