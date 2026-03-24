/**
 * NoteChat — Scoped chat assistant for the note editor.
 *
 * Ephemeral chat using Haiku, scoped to the current note + project context.
 * Each assistant message has a "Save to note" button.
 */

import { useState, useRef, useEffect } from 'react'
import { getClient } from '@/lib/anthropic-client'
import type { Note } from '@/types/entities'
import type { WorkGraph } from '@/types/graph'
import type { DecisionEntity, TaskEntity } from '@/types/entities'

interface NoteChatProps {
  note: Note
  projectSlug: string
  graph: WorkGraph
  onSaveToNote: (text: string) => void
}

type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function buildSystemPrompt(note: Note, projectSlug: string, graph: WorkGraph): string {
  const decisions = graph.entities
    .filter((e): e is DecisionEntity => e.kind === 'decision' && e.project === projectSlug && e.status === 'active')
    .map((d) => `- ${d.title}: ${d.decision}`)
    .join('\n')

  const tasks = graph.entities
    .filter((e): e is TaskEntity => e.kind === 'task' && e.project === projectSlug && (e.status === 'todo' || e.status === 'in_progress'))
    .map((t) => `- ${t.title} (${t.status})`)
    .join('\n')

  return `You are a thinking partner. The user is working on a note titled "${note.title}" in project "${projectSlug}".

Note body:
${note.body || '(empty)'}

Active decisions:
${decisions || 'None'}

Current tasks:
${tasks || 'None'}

Help them think through this topic. Be concise and direct.`
}

export function NoteChat({ note, projectSlug, graph, onSaveToNote }: NoteChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setError(null)

    const userMessage: ChatMessage = { role: 'user', content: text }
    const updated = [...messages, userMessage]
    setMessages(updated)
    setLoading(true)

    try {
      const client = getClient()
      const response = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: buildSystemPrompt(note, projectSlug, graph),
        messages: updated.map((m) => ({ role: m.role, content: m.content })),
      })

      const assistantText = response.content
        .filter((block) => block.type === 'text')
        .map((block) => ('text' in block ? block.text : ''))
        .join('')

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantText }])
    } catch (err) {
      console.error('[NoteChat] API call failed:', err)
      setError('AI unavailable')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Chat assistant</h3>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-gray-400 italic">
            Ask a question about this note to get started.
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-blue-50 text-gray-800 ml-6'
                : 'bg-gray-50 text-gray-800 mr-2'
            }`}
          >
            <div className="whitespace-pre-wrap">{msg.content}</div>
            {msg.role === 'assistant' && (
              <button
                type="button"
                onClick={() => onSaveToNote(msg.content)}
                className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Save to note
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-400 mr-2">
            Thinking...
          </div>
        )}
        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about this note..."
          disabled={loading}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </div>
  )
}
