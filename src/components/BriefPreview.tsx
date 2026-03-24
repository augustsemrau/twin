/**
 * BriefPreview — Markdown preview of a generated context pack.
 *
 * Renders markdown via markdown-it with copy-to-clipboard and
 * optional write-to-project functionality.
 */

import { useState } from 'react'
import markdownit from 'markdown-it'

interface BriefPreviewProps {
  markdown: string
  onCopy: () => void
  onWriteToProject?: () => void
}

const md = markdownit({
  html: false,
  linkify: true,
  typographer: true,
})

export function BriefPreview({ markdown, onCopy, onWriteToProject }: BriefPreviewProps) {
  const [copied, setCopied] = useState(false)
  const [written, setWritten] = useState(false)

  const html = md.render(markdown)

  function handleCopy() {
    setCopied(true)
    onCopy()
    setTimeout(() => setCopied(false), 2000)
  }

  function handleWrite() {
    if (!onWriteToProject) return
    setWritten(true)
    onWriteToProject()
    setTimeout(() => setWritten(false), 2000)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 pb-3 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 flex-1">Brief Preview</h3>
        <button
          type="button"
          onClick={handleCopy}
          className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy to Clipboard'}
        </button>
        {onWriteToProject && (
          <button
            type="button"
            onClick={handleWrite}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            {written ? 'Written!' : 'Write to Project CLAUDE.md'}
          </button>
        )}
      </div>

      {/* Markdown content */}
      <div className="flex-1 overflow-auto mt-3">
        <div
          className="prose prose-sm max-w-none bg-white
            prose-headings:text-gray-900 prose-p:text-gray-700
            prose-strong:text-gray-900 prose-code:text-gray-800
            prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-gray-100 prose-pre:text-gray-800
            prose-li:text-gray-700 prose-a:text-blue-600"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  )
}
