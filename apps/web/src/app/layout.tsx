import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Relay",
  description: "Browser-first cross-AI project memory sidecar."
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
