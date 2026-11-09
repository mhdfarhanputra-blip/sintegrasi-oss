/**
 * Rate limiter sederhana berbasis in-memory.
 * Cocok untuk single instance Vercel function.
 */

const WINDOW_MS = 60_000
const MAX_REQUESTS = 30

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function checkRateLimit(key: string, limit = MAX_REQUESTS, windowMs = WINDOW_MS): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (bucket.count >= limit) return false

  bucket.count += 1
  return true
}

if (typeof globalThis !== 'undefined' && !(globalThis as { __rateLimitCleanup?: boolean }).__rateLimitCleanup) {
  (globalThis as { __rateLimitCleanup?: boolean }).__rateLimitCleanup = true
  setInterval(() => {
    const now = Date.now()
    for (const [key, bucket] of buckets.entries()) {
      if (bucket.resetAt < now) buckets.delete(key)
    }
  }, 5 * 60_000)
}
