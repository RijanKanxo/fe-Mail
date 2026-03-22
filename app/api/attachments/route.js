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
  const emailId = searchParams.get("emailId")
  const attachmentId = searchParams.get("attachmentId")

  if (!emailId || !attachmentId) {
    return Response.json({ error: "emailId and attachmentId are required" }, { status: 400 })
  }

  // Fetch message metadata to recover filename + mime type for content headers.
  const messageRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}?format=full`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  )
  if (!messageRes.ok) {
    return Response.json({ error: "Unable to fetch email for attachment" }, { status: messageRes.status })
  }
  const message = await messageRes.json()

  function findAttachmentMeta(payload) {
    if (!payload) return null
    if (payload?.body?.attachmentId === attachmentId) {
      return {
        filename: (payload.filename || "attachment").trim() || "attachment",
        mimeType: payload.mimeType || "application/octet-stream",
      }
    }
    if (payload.parts?.length) {
      for (const part of payload.parts) {
        const found = findAttachmentMeta(part)
        if (found) return found
      }
    }
    return null
  }

  const meta = findAttachmentMeta(message.payload) || {
    filename: "attachment",
    mimeType: "application/octet-stream",
  }

  const attachmentRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${emailId}/attachments/${attachmentId}`,
    { headers: { Authorization: `Bearer ${session.accessToken}` } }
  )
  if (!attachmentRes.ok) {
    return Response.json({ error: "Unable to fetch attachment from Gmail" }, { status: attachmentRes.status })
  }
  const attachmentData = await attachmentRes.json()
  const raw = attachmentData?.data || ""
  const bytes = Buffer.from(raw, "base64url")
  const mimeType = meta.mimeType || "application/octet-stream"
  const filename = meta.filename || "attachment"

  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "private, max-age=60",
    },
  })
}
