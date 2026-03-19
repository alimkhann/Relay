import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { ThemeProvider } from "@/components/theme-provider";
import { GlobalTelemetryBootstrap } from "@/components/telemetry/global-telemetry-bootstrap";
import { LogoPreloader } from "@/components/ui/logo-preloader";

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
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("relay-theme");var d=document.documentElement;if(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme:dark)").matches)){d.classList.add("dark")}else{d.classList.add("light")}}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var path=location.pathname;
  var isDashboardPath=path==="/"||path==="/dashboard"||path.startsWith("/dashboard/")||path.startsWith("/activity")||path.startsWith("/memory")||path.startsWith("/settings")||path.startsWith("/projects")||path.startsWith("/brief");
  if(!isDashboardPath)return;
  var p=new URLSearchParams(location.search);
  var isAuth=p.get("auth_callback")==="1";
  var seen=sessionStorage.getItem("relay_preloader_shown")==="1";
  if(!isAuth&&seen)return;
  var dark=path==="/"||document.documentElement.classList.contains("dark");
  var el=document.createElement("div");
  el.id="relay-preloader";
  el.style.cssText="position:fixed;inset:0;z-index:9999;background:"+(dark?"#0a0a0a":"#fff");
  document.documentElement.appendChild(el);
}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <ThemeProvider>
          <GlobalTelemetryBootstrap />
          <LogoPreloader />
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
