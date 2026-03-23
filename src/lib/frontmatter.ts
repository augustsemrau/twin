import matter from 'gray-matter'
import type { Note } from '@/types/entities'

function toStr(val: unknown): string {
  if (val instanceof Date) return val.toISOString().split('T')[0]
  return String(val ?? '')
}

export function parseNote(content: string, filename: string): Note {
  const { data, content: body } = matter(content)
  return {
    id: data.id ?? '',
    filename,
    title: data.title ?? '',
    type: data.type ?? 'thought',
    project: data.project ?? undefined,
    twin_synced: data.twin_synced ?? true,
    linked_delivery: data.linked_delivery,
    people: data.people,
    date: data.date ? toStr(data.date) : undefined,
    created: toStr(data.created),
    updated: toStr(data.updated),
    body: body.trim(),
  }
}

export function stringifyNote(note: Note): string {
  const frontmatter: Record<string, unknown> = {
    id: note.id,
    title: note.title,
    type: note.type,
    twin_synced: note.twin_synced,
    created: note.created,
    updated: note.updated,
  }
  if (note.project) frontmatter.project = note.project
  if (note.linked_delivery) frontmatter.linked_delivery = note.linked_delivery
  if (note.people?.length) frontmatter.people = note.people
  if (note.date) frontmatter.date = note.date

  return matter.stringify(note.body, frontmatter)
}
