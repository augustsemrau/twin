import { Document, parseDocument, stringify, parse } from 'yaml'

export function parseYamlDoc(text: string): Document {
  return parseDocument(text)
}

export function stringifyYamlDoc(doc: Document): string {
  return doc.toString()
}

export function readYamlList<T>(text: string, key: string): T[] {
  const data = parse(text)
  return (data?.[key] ?? []) as T[]
}

export function parseYaml<T>(text: string): T {
  return parse(text) as T
}

export function toYamlString(data: unknown): string {
  return stringify(data, { lineWidth: 0 })
}
