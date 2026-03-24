import { useState, useEffect } from 'react'
import type { ActiveSession } from '@/types/sessions'
import type { ReconcilerOutput } from '@/types/agents'

interface SessionBannerProps {
  session: ActiveSession
  reconcilerResult: ReconcilerOutput | null
  onMarkDone: () => void
  onImportConversation: () => void
  onReviewDeltas: () => void
  onQuickSummary?: (summary: string) => void
  onClipboardImport?: (text: string) => void
}

export function SessionBanner({
  session,
  reconcilerResult,
  onMarkDone,
  onImportConversation,
  onReviewDeltas,
  onQuickSummary,
  onClipboardImport,
}: SessionBannerProps) {
  const shortId = session.session_id.slice(0, 10) + '...'
  const [quickSummary, setQuickSummary] = useState('')
  const [clipboardText, setClipboardText] = useState<string | null>(null)

  // Clipboard auto-detect for Chat sessions
  useEffect(() => {
    if (session.target !== 'chat') return

    async function checkClipboard() {
      try {
        // Try Tauri clipboard plugin first, fall back to navigator.clipboard
        let text: string | undefined
        try {
          // Dynamic import — will fail if plugin not installed
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const modPath = '@tauri-apps/plugin-clipboard-manager'
          const mod = await (Function('p', 'return import(p)')(modPath) as Promise<{ readText: () => Promise<string> }>)
          text = await mod.readText()
        } catch {
          // Fall back to web clipboard API
          text = await navigator.clipboard.readText()
        }
        // Detect multi-line text as potential conversation
        if (text && text.includes('\n') && text.length > 100) {
          setClipboardText(text)
        }
      } catch {
        // Clipboard API not available — ignore
      }
    }

    checkClipboard()
  }, [session.target])

  const handleQuickSummarySubmit = () => {
    const trimmed = quickSummary.trim()
    if (trimmed && onQuickSummary) {
      onQuickSummary(trimmed)
      setQuickSummary('')
    }
  }

  const handleClipboardImport = () => {
    if (clipboardText && onClipboardImport) {
      onClipboardImport(clipboardText)
      setClipboardText(null)
    }
  }

  // After manifest received and reconciled
  if (session.writeback_received && reconcilerResult) {
    const deltaCount = reconcilerResult.proposed_deltas.length
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-2">
        <p className="text-sm text-green-800">
          <span className="font-semibold">Session reconciled</span>
          {' '}&mdash; {deltaCount} delta{deltaCount !== 1 ? 's' : ''} proposed
          {reconcilerResult.unresolved.length > 0 && (
            <span className="ml-1 text-amber-700">
              ({reconcilerResult.unresolved.length} unresolved)
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onReviewDeltas}
          className="rounded-md bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          Review
        </button>
      </div>
    )
  }

  // Chat session — user needs to provide writeback
  if (session.target === 'chat') {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2">
          <p className="text-sm text-blue-800">
            <span className="font-medium">Session {shortId}</span> active (Chat) &mdash;{' '}
            &ldquo;{session.objective}&rdquo;
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onImportConversation}
              className="rounded-md border border-blue-300 bg-white px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              Import conversation
            </button>
            <button
              type="button"
              onClick={onMarkDone}
              className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
            >
              Mark done
            </button>
          </div>
        </div>

        {/* Inline quick summary field */}
        <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2">
          <input
            type="text"
            value={quickSummary}
            onChange={(e) => setQuickSummary(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSummarySubmit() }}
            placeholder="Quick summary of what happened..."
            className="flex-1 border-none bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none"
          />
          <button
            type="button"
            onClick={handleQuickSummarySubmit}
            disabled={!quickSummary.trim() || !onQuickSummary}
            className="rounded-md bg-gray-600 px-3 py-1 text-xs font-medium text-white hover:bg-gray-700 disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Save
          </button>
        </div>

        {/* Clipboard auto-detect */}
        {clipboardText && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-purple-200 bg-purple-50 px-4 py-2">
            <p className="text-sm text-purple-800">
              Clipboard contains a multi-line conversation ({clipboardText.split('\n').length} lines)
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleClipboardImport}
                className="rounded-md bg-purple-600 px-3 py-1 text-sm font-medium text-white hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                Import this conversation?
              </button>
              <button
                type="button"
                onClick={() => setClipboardText(null)}
                className="text-xs text-purple-500 hover:text-purple-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Code / Cowork — waiting for manifest
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2">
      <p className="text-sm text-amber-800">
        <span className="font-medium">Session {shortId}</span> active (
        {session.target === 'code' ? 'Code' : 'Cowork'}) &mdash;{' '}
        &ldquo;{session.objective}&rdquo;
        <span className="ml-2 text-amber-600">Waiting for manifest...</span>
      </p>
      <button
        type="button"
        onClick={onMarkDone}
        className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-400"
      >
        Mark done
      </button>
    </div>
  )
}
