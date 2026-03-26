import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"
import { enforceRateLimit } from "@/lib/request-rate-limiter"

function sanitizeHeaderValue(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").trim()
}

export async function POST(request) {
  const limit = enforceRateLimit(request, "send", { max: 20, windowMs: 60_000 })
  if (!limit.ok) {
    return Response.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    )
  }

  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 })
  if (session.error === "RefreshAccessTokenError") {
    return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 })
  }
  if (!session.accessToken) {
    return Response.json({ error: "Missing Gmail access token. Please sign out and sign in again." }, { status: 401 })
  }

  const { to, subject, body, threadId, messageId } = await request.json()
  const safeTo = sanitizeHeaderValue(to)
  const safeSubject = sanitizeHeaderValue(subject || "(no subject)")

  if (!safeTo || !safeTo.includes("@")) {
    return Response.json({ error: "A valid recipient email is required." }, { status: 400 })
  }
  if (!String(body || "").trim()) {
    return Response.json({ error: "Message body is required." }, { status: 400 })
  }

  // build RFC 2822 email format
  const headers = [
    `To: ${safeTo}`,
    `Subject: ${safeSubject}`,
    `Content-Type: text/plain; charset=utf-8`,
  ]
  const safeMessageId = sanitizeHeaderValue(messageId)
  if (safeMessageId) {
    headers.push(`In-Reply-To: ${safeMessageId}`)
    headers.push(`References: ${safeMessageId}`)
  }

  const email = [...headers, ``, String(body)].join("\n")

  // gmail needs it base64url encoded
  const encoded = Buffer.from(email)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "")

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        raw: encoded,
        threadId,
      }),
    }
  )

  const data = await res.json()
  if (data.error) return Response.json({ error: data.error }, { status: 400 })
  return Response.json({ success: true })
}