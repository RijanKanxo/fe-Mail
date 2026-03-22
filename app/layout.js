import { getServerSession } from "next-auth"
import SessionProvider from "./SessionProvider"
import "./globals.css"
import { authOptions } from "./api/auth/[...nextauth]/route"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions)
  return (
    <html lang="en" data-theme="light" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var theme = localStorage.getItem("fm-theme") || "light";
                  document.documentElement.setAttribute("data-theme", theme);
                } catch (e) {
                  document.documentElement.setAttribute("data-theme", "light");
                }
              })();
            `,
          }}
        />
      </head>
      <body>
        <SessionProvider session={session}>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </SessionProvider>
      </body>
    </html>
  )
}