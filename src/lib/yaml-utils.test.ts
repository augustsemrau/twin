import { describe, it, expect } from 'vitest'
import { parseYamlDoc, stringifyYamlDoc, readYamlList, parseYaml, toYamlString } from './yaml-utils'

describe('yaml-utils', () => {
  it('preserves comments above keys during round-trip', () => {
    const input = '# Tasks — municipality-platform\n# Updated: 2026-03-17\n\ntasks:\n  - id: 01JBQF3A1K\n    title: Test task\n    status: todo\n'
    const doc = parseYamlDoc(input)
    const output = stringifyYamlDoc(doc)
    expect(output).toContain('# Tasks — municipality-platform')
    expect(output).toContain('# Updated: 2026-03-17')
  })

  it('parses a YAML list into typed array', () => {
    const input = 'tasks:\n  - id: abc\n    title: Task One\n    status: todo\n  - id: def\n    title: Task Two\n    status: done\n'
    const result = readYamlList<{ id: string; title: string; status: string }>(input, 'tasks')
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('abc')
    expect(result[1].status).toBe('done')
  })

  it('parses plain YAML into object', () => {
    const input = 'name: Test\nvalue: 42\n'
    const result = parseYaml<{ name: string; value: number }>(input)
    expect(result.name).toBe('Test')
    expect(result.value).toBe(42)
  })

  it('serializes object to YAML string', () => {
    const data = { tasks: [{ id: 'abc', title: 'Test' }] }
    const output = toYamlString(data)
    expect(output).toContain('id: abc')
    expect(output).toContain('title: Test')
  })

  it('handles null values in YAML', () => {
    const input = 'tasks:\n  - id: abc\n    blocked_by: null\n'
    const result = readYamlList<{ id: string; blocked_by: string | null }>(input, 'tasks')
    expect(result[0].blocked_by).toBeNull()
  })

  it('handles arrays in YAML (decision unblocks)', () => {
    const input = 'decisions:\n  - id: abc\n    unblocks:\n      - task1\n      - task2\n'
    const result = readYamlList<{ id: string; unblocks: string[] }>(input, 'decisions')
    expect(result[0].unblocks).toEqual(['task1', 'task2'])
  })

  it('returns empty array for missing key', () => {
    const input = 'other: value\n'
    const result = readYamlList<unknown>(input, 'tasks')
    expect(result).toEqual([])
  })
})
