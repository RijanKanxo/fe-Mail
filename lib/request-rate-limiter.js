const buckets = new Map()

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for")
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim()
    if (first) return first
  }
  return "unknown"
}

export function enforceRateLimit(request, routeKey, { max = 60, windowMs = 60_000 } = {}) {
  const now = Date.now()
  const key = `${routeKey}:${getClientIp(request)}`
  const bucket = buckets.get(key)

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: max - 1, resetAt: now + windowMs, retryAfter: 0 }
  }

  if (bucket.count >= max) {
    const retryAfterMs = Math.max(0, bucket.resetAt - now)
    return {
      ok: false,
      remaining: 0,
      resetAt: bucket.resetAt,
      retryAfter: Math.ceil(retryAfterMs / 1000),
    }
  }

  bucket.count += 1
  buckets.set(key, bucket)
  return { ok: true, remaining: Math.max(0, max - bucket.count), resetAt: bucket.resetAt, retryAfter: 0 }
}
