import { describe, it, expect } from 'vitest'
import { safeHttpUrl } from './safeUrl'

describe('safeHttpUrl', () => {
  it('mengembalikan null untuk null/undefined/empty', () => {
    expect(safeHttpUrl(null)).toBeNull()
    expect(safeHttpUrl(undefined)).toBeNull()
    expect(safeHttpUrl('')).toBeNull()
  })

  it('menerima url https dan mengandung host', () => {
    const result = safeHttpUrl('https://example.com')
    expect(result).not.toBeNull()
    expect(result).toContain('example.com')
  })

  it('menerima url http (tidak null)', () => {
    expect(safeHttpUrl('http://x.test/a')).not.toBeNull()
  })

  it('menolak protokol non-http', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('ftp://x')).toBeNull()
  })

  it('menolak string sampah yang bukan url', () => {
    expect(safeHttpUrl('bukan url')).toBeNull()
  })
})
