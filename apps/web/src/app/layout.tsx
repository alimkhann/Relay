import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Analytics } from "@vercel/analytics/next";
import { APP_ORIGIN } from "@/lib/site-config";

import { ThemeProvider } from "@/components/theme-provider";
import { GlobalTelemetryBootstrap } from "@/components/telemetry/global-telemetry-bootstrap";
import { PostHogProvider } from "@/components/telemetry/posthog-provider";
import { SampledSpeedInsights } from "@/components/telemetry/sampled-speed-insights";
import { LogoPreloader } from "@/components/ui/logo-preloader";

import "./globals.css";

const vercelTelemetryEnabled = process.env.VERCEL === "1";

export const metadata: Metadata = {
  metadataBase: new URL(APP_ORIGIN),
  title: "Relay",
  description: "Keep your project brief ready for every fresh AI chat.",
  icons: {
    icon: "/images/relay_logo_white.png",
    shortcut: "/images/relay_logo_white.png",
    apple: "/images/relay_logo_white.png",
  },
  openGraph: {
    title: "Relay",
    description: "Keep your project brief ready for every fresh AI chat.",
    siteName: "Relay",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay",
    description: "Keep your project brief ready for every fresh AI chat.",
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
  var isDashboardPath=path==="/"||path==="/dashboard"||path.startsWith("/dashboard/")||path.startsWith("/activity")||path.startsWith("/memory")||path.startsWith("/sources")||path.startsWith("/graph")||path.startsWith("/settings")||path.startsWith("/projects")||path.startsWith("/brief");
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
  var p=location.pathname;
  var isDash=p==="/dashboard"||p.startsWith("/dashboard/")||p.startsWith("/activity")||p.startsWith("/memory")||p.startsWith("/sources")||p.startsWith("/graph")||p.startsWith("/settings")||p.startsWith("/projects")||p.startsWith("/brief");
  if(!isDash)return;
  var isLight=document.documentElement.classList.contains("light");
  if(!isLight&&!matchMedia("(prefers-color-scheme:light)").matches)return;
  var img=new Image();img.crossOrigin="anonymous";
  img.onload=function(){
    var c=document.createElement("canvas");c.width=64;c.height=64;
    var ctx=c.getContext("2d");ctx.filter="brightness(0)";
    ctx.drawImage(img,0,0,64,64);
    var link=document.querySelector("link[rel='icon']");
    if(!link){link=document.createElement("link");link.rel="icon";document.head.appendChild(link)}
    link.href=c.toDataURL("image/png");
  };
  img.src="/images/relay_logo_white.png";
}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <PostHogProvider>
          <ThemeProvider>
            <GlobalTelemetryBootstrap />
            <LogoPreloader />
            {children}
          </ThemeProvider>
        </PostHogProvider>
        {vercelTelemetryEnabled ? (
          <>
            <Analytics />
            <SampledSpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
