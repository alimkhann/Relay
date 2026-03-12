import type { Metadata } from "next";
import "@fontsource-variable/outfit";
import { Analytics } from "@vercel/analytics/next";

import { ThemeProvider } from "@/components/theme-provider";

import "./globals.css";

export const metadata: Metadata = {
  title: "Relay",
  description: "Keep your project brief ready for every fresh AI chat.",
  icons: {
    icon: "/images/relay_logo_white.png",
    shortcut: "/images/relay_logo_white.png",
    apple: "/images/relay_logo_white.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("relay-theme");var d=document.documentElement;if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches)){d.classList.add("dark")}else{d.classList.add("light")}}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
