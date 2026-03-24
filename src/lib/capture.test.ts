import { describe, it, expect } from 'vitest'
import { generateCaptureFilename, formatCaptureContent } from './capture'

describe('capture', () => {
  it('generates filename with local timestamp and slug', () => {
    const now = new Date(2026, 2, 17, 9, 14, 0) // March 17, 2026 09:14:00 LOCAL
    const filename = generateCaptureFilename("Thomas still hasn't responded re infra cost", now)
    expect(filename).toBe('2026-03-17T09-14-00-thomas-still-hasnt-responded-re-infra.md')
  })

  it('truncates slug to 40 chars', () => {
    const long = 'This is a very long capture text that should be truncated to forty characters maximum'
    const now = new Date(2026, 2, 17, 10, 0, 0)
    const filename = generateCaptureFilename(long, now)
    const slug = filename.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-/, '').replace('.md', '')
    expect(slug.length).toBeLessThanOrEqual(40)
  })

  it('sanitizes special characters in slug', () => {
    const now = new Date(2026, 2, 17, 10, 0, 0)
    const filename = generateCaptureFilename('Cost: $5,000 — really?!', now)
    expect(filename).not.toContain('$')
    expect(filename).not.toContain('!')
    expect(filename).not.toContain('—')
    expect(filename).toContain('cost-5000--really')
  })

  it('handles empty text', () => {
    const now = new Date(2026, 2, 17, 10, 0, 0)
    const filename = generateCaptureFilename('', now)
    expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-.+\.md$/)
  })

  it('formats capture content with correct frontmatter', () => {
    const content = formatCaptureContent('Thomas sent the cost estimate')
    expect(content).toContain('---')
    expect(content).toContain('captured:')
    expect(content).toContain('raw: true')
    expect(content).toContain('source: capture')
    expect(content).toContain('Thomas sent the cost estimate')
  })

  it('uses local time in frontmatter timestamp', () => {
    const now = new Date(2026, 2, 17, 9, 14, 0)
    const content = formatCaptureContent('Test', now)
    expect(content).toContain('2026-03-17')
  })
})
