export type InAppBrowserPlatform = "android" | "ios" | null;

export function detectInAppBrowser(): InAppBrowserPlatform {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  const isInApp =
    /\b(FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|TikTok|Twitter|Line|MicroMessenger)\b/i.test(ua) ||
    /; wv\)/.test(ua);
  if (!isInApp) return null;
  return /android/i.test(ua) ? "android" : "ios";
}

export function buildAndroidChromeIntent(url: string): string {
  const u = new URL(url);
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
