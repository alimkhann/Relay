export type InAppBrowserPlatform = "android" | "ios" | null;

export function detectInAppBrowser(): InAppBrowserPlatform {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;

  // App-specific UA tokens (sourced from inapp-spy + confirmed UA samples)
  // Threads uses "Barcelona", not "Instagram"
  const isKnownInApp =
    /\b(Instagram|Barcelona|FBAN|FBAV|FB_IAB|Facebook|Twitter|LinkedInApp|Snapchat|GSA)\b/i.test(ua) ||
    /\b(musical_ly|Bytedance)\b/i.test(ua) ||   // TikTok
    /\b(WAiOS|WA4A)\//i.test(ua) ||              // WhatsApp
    /\bLine\//i.test(ua) ||
    /\bMicroMessenger\//i.test(ua);              // WeChat

  // Catch-all: iPhone/iPad without Safari/ = WebView
  const isIOSWebView = /(iPhone|iPod|iPad)/.test(ua) && !/Safari\//.test(ua);

  // Android WebView marker
  const isAndroidWebView = /Android.*wv\)/.test(ua) || /; wv\)/.test(ua);

  const isInApp = isKnownInApp || isIOSWebView || isAndroidWebView;
  if (!isInApp) return null;
  return /android/i.test(ua) ? "android" : "ios";
}

export function buildAndroidChromeIntent(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
