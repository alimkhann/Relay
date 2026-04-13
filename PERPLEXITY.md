Here's a comprehensive pre-launch breakdown for Relay, organized by category. I've researched every item you listed plus added what's missing from your list.

***

## SEO & Discoverability

**Google Search Console** is a free tool by Google where you verify ownership of `onrelay.app` and tell Google your site exists. You don't need it for users to find your extension, but it helps your landing page rank. Steps: go to [search.google.com/search-console](https://search.google.com/search-console), add your property, verify via DNS TXT record (easiest with Namecheap), then submit your sitemap. [siteground](https://www.siteground.com/kb/submit-website-to-google/)

**Sitemaps** are XML files listing all your pages so crawlers can index them. If you're on Next.js, it auto-generates at `/sitemap.xml` via `next-sitemap` package. Submit that URL in Search Console under Indexing → Sitemaps. Once submitted, Google will crawl it — takes a few days to a week to show results. [docs.onprintshop](https://docs.onprintshop.com/user-manual/submit-sitemap-to-google-search-console)

**Bing Webmaster Tools** works the same way at [bing.com/webmasters](https://bing.com/webmasters). Worth doing because Bing now powers Copilot search — it imports from Google Search Console in one click, so it takes ~2 minutes after GSC is set up.

***

## Open Graph & Social Previews

OG images are what show up when someone shares your link on Twitter/X, Slack, LinkedIn, etc. Test yours right now at [opengraph.xyz](https://opengraph.xyz) — paste `https://onrelay.app` and see what renders. You need `og:title`, `og:description`, `og:image` (1200×630px recommended), and `og:url` meta tags in your `<head>`. Also add `twitter:card: summary_large_image` for X previews. [horizon-labs](https://www.horizon-labs.co/resources/the-ultimate-pre-launch-checklist-for-saas-startups-31-key-to-success)

***

## Email: Transactional & Sequences

**Welcome email fix** — your current one sounds misaligned. The copy should reflect Relay's actual value prop (AI context management across coding sessions, not just "3 tools"). Keep it short: what Relay does in 1 line, one CTA to open the extension, and a human sign-off.

**Resend supports email sequences** via their [Broadcasts](https://resend.com/blog/send-marketing-emails-with-resend-broadcasts) feature for manual one-off blasts, but **for automated drip sequences** (inactivity triggers, onboarding cadence), you'll need to use Resend's API directly with a scheduler. The flow is: user event (e.g., no activity for 7 days) → your backend (cron job or a queue like Inngest/Trigger.dev) → call Resend API → send email. Resend doesn't have a built-in visual sequence builder like Loops or Customer.io, but it's very capable for programmatic sending. [resend](https://resend.com/blog/send-marketing-emails-with-resend-broadcasts)

**Suggested email sequence for Relay:**
- Day 0: Welcome (fix the copy and color palette)
- Day 1: "Did you set up the MCP?" — feature education
- Day 3: Tips on using the context manager effectively
- Day 7 (inactive): Re-engagement — "Your context is waiting"
- Day 30 (active free user): Upgrade nudge showing what Pro unlocks

For email deliverability, make sure your Resend domain is verified with SPF, DKIM, and DMARC records on Namecheap — Resend's dashboard shows you exactly what to add. [dev](https://dev.to/shayy/my-checklist-before-launching-any-app-2a8h)

***

## Legal & Cookie Consent

**Privacy Policy for Chrome Web Store** is non-negotiable — Google requires a publicly accessible URL that accurately describes what data Relay collects, why, and how. Be specific about: what the extension reads (tab data, code context), whether you store it, and your third-party services (PostHog, Stripe, Supabase, etc.). Vague or template-only policies get flagged. [ultrafastutilities](https://ultrafastutilities.com/privacy-policy-for-chrome-extension)

**Terms of Service** should cover: acceptable use, account termination, billing/refund policy, and that you're not liable for AI-generated context. Keep it human-readable but don't make it "too direct" about data practices beyond what's already in the Privacy Policy.

**Cookie consent** — since you want minimal, use a small bottom bar that appears once and disappears after accept/decline. Libraries like `react-cookie-consent` or [Cookieyes's free tier](https://www.cookieyes.com) handle this. You technically need it if you serve EU users, which you likely will. Keep it non-blocking (don't gate content behind it).

***

## Google OAuth: Going to Production

This is what likely caused your friend's issue. If your OAuth app is still in **"Testing" mode**, only users you manually add to the test users list can sign in — everyone else gets an error. To fix: [support.google](https://support.google.com/cloud/answer/13461325?hl=en)

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → OAuth consent screen
2. Click **"Publish App"** to move from Testing → Production
3. If you're only using basic scopes (email, profile), **no verification is required** and it goes live instantly
4. If you use sensitive scopes (like Calendar, Gmail, Drive), you'll need Google's verification process which takes 1–4 weeks [developers.google](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance)

For Relay, you likely only need `email` and `profile`, so publishing to production should be immediate. Make sure your homepage URL, privacy policy URL, and app logo are filled in on the consent screen — Google shows these to users when they auth. [community.openai](https://community.openai.com/t/moving-your-google-oauth-app-to-production/589055)

***

## Security Checklist

Things to verify before launch:
- **Rate limiting** on your API endpoints — especially context-save and MCP endpoints
- **Auth tokens** stored securely (not in localStorage if possible — use httpOnly cookies or Supabase's session management)
- **CORS** configured to only allow `onrelay.app` and your extension's origin
- **CSP headers** on your landing page and dashboard
- **Stripe webhook signature verification** — validate every webhook with the signing secret, don't trust payload alone

***

## Billing & Subscription Safety

- Test the full cancel flow end-to-end in Stripe test mode — does the user get downgraded to Free immediately or at period end? (Stripe defaults to period-end, which is user-friendly)
- Test plan downgrade: if someone on Pro tries to use a Free feature cap, does it gracefully limit or hard-fail?
- Make sure failed payment → dunning emails are set up in Stripe (Stripe sends these automatically but confirm they're enabled in your billing settings)
- Add a visible "Manage Billing" link in your dashboard that goes to the Stripe customer portal — this is required to avoid chargebacks

***

## Chrome Web Store Submission

**MV3 specific requirements**: your extension's code must be bundled — no remote code execution, no dynamic `eval()`, and all logic must be in the package itself. If you fetch any AI logic remotely (like prompts from your server), that's fine — only executable code needs to be local. [developer.chrome](https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements)

**Privacy data certification**: in the Developer Dashboard you must fill out a data handling questionnaire certifying exactly what data your extension accesses. This must match your privacy policy word-for-word. Be precise — "reads active tab URL" vs "reads all browsing history" are treated very differently. [ultrafastutilities](https://ultrafastutilities.com/privacy-policy-for-chrome-extension)

**Screenshots** must be exactly **1280×800 or 640×400 pixels**, square corners, no padding. For Relay, ideal shots to show: [developer.chrome](https://developer.chrome.com/docs/webstore/images)
1. The sidebar open on a coding context (shows core value)
2. The toast/inline chip appearing in real use
3. MCP integration in a terminal or Claude/Cursor (shows power user appeal)
4. The dashboard/context history view

For making them visually stunning — yes, the "nano banana" style (blurred gradient background + clean UI screenshot) works great. Use Figma: drop your screenshot on a dark/colorful gradient background, add subtle drop shadow, and a 1-line caption. Tools like [Shots.so](https://shots.so) or [Screely](https://www.screely.com) can wrap your screenshots automatically.

**Promotional tile**: you also need a **440×280px** promotional image for the store listing. Think of it as your app store banner — brand name, short tagline, extension icon. [developer.chrome](https://developer.chrome.com/docs/webstore/images)

**Store video**: you already have it — great. Keep it under 2 minutes, starts showing value in the first 15 seconds.

***

## What's Missing from Your List

Here are gaps your reel didn't mention:

- **Product Hunt listing** — draft it before launch. The hunter, tagline, and first comment matter most. Even a soft launch on PH gets you backlinks and early users [beyondlabs](https://beyondlabs.io/blogs/how-to-get-your-first-100-saas-users-with-a-product-hunt-launch)
- **Status page** — even a free Instatus or Betterstack page builds trust for a paid product
- **Favicon + PWA manifest** — small but shows polish; make sure `onrelay.app` has a proper favicon at 32×32 and 180×180 (Apple touch)
- **Stripe Tax** — enable it in Stripe if you want automatic VAT/GST calculation for EU/UK/AU users (one toggle in Stripe settings)
- **robots.txt** — make sure it's not accidentally blocking your landing page from crawlers
- **A backup/recovery plan** — what happens if Supabase goes down mid-session? Do users lose context? Worth having at least a local cache fallback in the extension
- **Feedback widget** — PostHog has one built-in, or use Canny/Typeform for early users to report bugs without friction
- **First 10 users plan** — who's getting the first invite? Personal outreach to 10 developers > any launch campaign for initial validation

***

Do you have the sitemap already generated and accessible at `onrelay.app/sitemap.xml`, or is that something you still need to set up? That'll determine the quickest path through the SEO setup.
