import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"

export async function GET(request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 })
  if (session.error === "RefreshAccessTokenError") {
    return Response.json({ error: "Session expired. Please sign in again." }, { status: 401 })
  }
  if (!session.accessToken) {
    return Response.json({ error: "Missing Gmail access token. Please sign out and sign in again." }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  const parsedLimit = parseInt(searchParams.get("limit") || "20", 10)
  const pageToken = searchParams.get("pageToken") || undefined
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(500, parsedLimit)) : 100

  // if an id is passed — fetch single email body
  if (id) {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`,
      { headers: { Authorization: `Bearer ${session.accessToken}` } }
    )
    if (!res.ok) {
      return Response.json({ error: "Unable to fetch email body from Gmail" }, { status: res.status })
    }
    const data = await res.json()

    // recursively find the plain text or html part
    function findBody(payload) {
      if (!payload) return ""

      // direct body
      if (payload.body?.data) {
        return Buffer.from(payload.body.data, "base64url").toString("utf-8")
      }

      // multipart — look through parts
      if (payload.parts) {
        // Prefer rich HTML rendering first to preserve message design.
        const html = payload.parts.find(p => p.mimeType === "text/html")
        if (html?.body?.data) {
          return Buffer.from(html.body.data, "base64url").toString("utf-8")
        }
        // Fall back to plain text.
        const plain = payload.parts.find(p => p.mimeType === "text/plain")
        if (plain?.body?.data) {
          return Buffer.from(plain.body.data, "base64url").toString("utf-8")
        }
        // recurse into nested parts
        for (const part of payload.parts) {
          const result = findBody(part)
          if (result) return result
        }
      }
      return ""
    }

    function collectAttachments(payload, out = []) {
      if (!payload) return out

      const contentIdHeader = (payload.headers || []).find(h => (h.name || "").toLowerCase() === "content-id")?.value || ""
      const hasAttachment = Boolean(payload?.body?.attachmentId)
      if (hasAttachment) {
        out.push({
          id: payload.body.attachmentId,
          filename: (payload.filename || "").trim() || "attachment",
          mimeType: payload.mimeType || "application/octet-stream",
          size: payload.body.size || 0,
          contentId: contentIdHeader,
        })
      }

      if (payload.parts?.length) {
        for (const part of payload.parts) collectAttachments(part, out)
      }
      return out
    }

    const body = findBody(data.payload)
    const attachments = collectAttachments(data.payload)
    return Response.json({ body, attachments })
  }

  // otherwise — fetch list of emails as before
  const params = new URLSearchParams({
    maxResults: String(limit),
    labelIds: "INBOX",
  })
  if (pageToken) params.set("pageToken", pageToken)

  const listRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  )
  if (!listRes.ok) {
    return Response.json({ error: "Unable to fetch inbox from Gmail" }, { status: listRes.status })
  }
  const listData = await listRes.json()
  if (!listData.messages) return Response.json({ emails: [], nextPageToken: listData.nextPageToken || null })

  const emails = await Promise.all(
    listData.messages.map(async (msg) => {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${session.accessToken}` } }
      )
      if (!msgRes.ok) {
        return null
      }
      const msgData = await msgRes.json()
      const headers = msgData.payload.headers
      return {
        id:      msg.id,
        subject: headers.find(h => h.name === "Subject")?.value || "(no subject)",
        from:    headers.find(h => h.name === "From")?.value || "Unknown",
        date:    headers.find(h => h.name === "Date")?.value || "",
        unread:  msgData.labelIds?.includes("UNREAD"),
      }
    })
  )

  return Response.json({
    emails: emails
      .filter(Boolean)
      .sort((a, b) => new Date(b.date) - new Date(a.date)),
    nextPageToken: listData.nextPageToken || null,
  })
}