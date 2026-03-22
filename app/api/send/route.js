import { getServerSession } from "next-auth"
import { authOptions } from "../auth/[...nextauth]/route"

export async function POST(request) {
  const session = await getServerSession(authOptions)
  if (!session) return Response.json({ error: "Not logged in" }, { status: 401 })

  const { to, subject, body, threadId, messageId } = await request.json()

  // build RFC 2822 email format
  const email = [
    `To: ${to}`,
    `Subject: Re: ${subject}`,
    `In-Reply-To: ${messageId}`,
    `References: ${messageId}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    body
  ].join("\n")

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