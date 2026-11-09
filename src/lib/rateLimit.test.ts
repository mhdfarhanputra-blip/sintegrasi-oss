import { describe, it, expect } from 'vitest'
import { checkRateLimit } from './rateLimit'

function uniqueKey(suffix: string): string {
  return `test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

describe('checkRateLimit', () => {
  it('panggilan pertama dengan key unik mengembalikan true', () => {
    expect(checkRateLimit(uniqueKey('first'))).toBe(true)
  })

  it('menolak panggilan setelah limit terlampaui', () => {
    const key = uniqueKey('limit')
    expect(checkRateLimit(key, 2)).toBe(true)
    expect(checkRateLimit(key, 2)).toBe(true)
    expect(checkRateLimit(key, 2)).toBe(false)
  })

  it('key berbeda tidak saling memengaruhi', () => {
    const keyA = uniqueKey('a')
    const keyB = uniqueKey('b')
    expect(checkRateLimit(keyA, 1)).toBe(true)
    expect(checkRateLimit(keyA, 1)).toBe(false)
    // keyB masih segar, tidak terpengaruh keyA
    expect(checkRateLimit(keyB, 1)).toBe(true)
  })
})
