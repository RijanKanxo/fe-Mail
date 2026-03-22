import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"

async function refreshGoogleAccessToken(token) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    })

    const refreshed = await response.json()
    if (!response.ok) {
      throw refreshed
    }

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    }
  } catch {
    return {
      ...token,
      error: "RefreshAccessTokenError",
    }
  }
}

export const authOptions = {
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/gmail.modify",
          access_type: "offline",
          prompt: "consent",
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.accessToken = account.access_token
        token.refreshToken = account.refresh_token
        token.accessTokenExpires = (account.expires_at || 0) * 1000
        return token
      }

      if (token.accessToken && token.accessTokenExpires && Date.now() < token.accessTokenExpires - 60_000) {
        return token
      }

      if (token.refreshToken) {
        return refreshGoogleAccessToken(token)
      }

      return token
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken
       session.error = token.error
      return session
    }
  }
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }