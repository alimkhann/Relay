import { Resend } from "resend"

let resend: Resend | null = null

function getResend(): Resend | null {
  if (!process.env["RESEND_API_KEY"]) return null
  if (!resend) resend = new Resend(process.env["RESEND_API_KEY"])
  return resend
}

export async function sendWelcomeEmail(to: string, name: string | null) {
  const client = getResend()
  if (!client) return

  const greeting = name ? `Hi ${name}` : "Hi there"
  const dashboardUrl = "https://www.onrelay.app/dashboard"
  const docsUrl = "https://www.onrelay.app/docs/getting-started"

  await client.emails.send({
    from: "Relay <support@onrelay.app>",
    to,
    subject: "Welcome to Relay",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting}, welcome to Relay!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Relay keeps your project context synchronized across ChatGPT, Claude, and Perplexity so every AI tool knows what you're working on.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Get started by setting up your first project:
        </p>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open Dashboard</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Need help? Check out the <a href="${docsUrl}" style="color: #2563eb;">setup wizard guide</a>.
        </p>
      </div>
    `
  })
}

export async function sendBetaInviteEmail(to: string, inviteLink: string) {
  const client = getResend()
  if (!client) return

  await client.emails.send({
    from: "Relay <support@onrelay.app>",
    to,
    subject: "You're invited to the Relay closed beta",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">You're in!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          You've been invited to the Relay closed beta. Relay keeps your project context synchronized across ChatGPT, Claude, Gemini, and more &mdash; so every AI tool knows what you're working on.
        </p>
        <div style="margin: 24px 0;">
          <a href="${inviteLink}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Accept Invite</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          This invite is just for you. If you have questions or feedback, reply to this email &mdash; we read everything.
        </p>
      </div>
    `
  })
}

export async function sendWaitlistConfirmationEmail(to: string) {
  const client = getResend()
  if (!client) return

  await client.emails.send({
    from: "Relay <support@onrelay.app>",
    to,
    subject: "You're on the Relay waitlist",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">You're on the list!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Thanks for signing up for Relay. We're rolling out access in small batches to make sure everything works smoothly.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          We'll email you as soon as your spot opens up. In the meantime, you can learn more about how Relay works on our site.
        </p>
        <p style="font-size: 14px; color: #6b7280; margin-top: 24px;">
          Questions? Reply to this email &mdash; we read everything.
        </p>
      </div>
    `
  })
}

export async function sendTrialExpiringEmail(to: string, daysLeft: number) {
  const client = getResend()
  if (!client) return

  const urgency = daysLeft <= 1 ? "expires today" : `expires in ${daysLeft} days`
  const billingUrl = "https://www.onrelay.app/dashboard/billing"

  await client.emails.send({
    from: "Relay <support@onrelay.app>",
    to,
    subject: `Your Relay trial ${urgency}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Your trial ${urgency}</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Your Relay free trial ${urgency}. After that, AI-powered analysis will pause and your projects will switch to the free tier.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Upgrade now to keep your full project briefs, AI analysis, and unlimited context sync.
        </p>
        <div style="margin: 24px 0;">
          <a href="${billingUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Upgrade Now</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Your projects and data are safe either way &mdash; you just won't get AI-powered analysis on the free tier.
        </p>
      </div>
    `
  })
}

export async function sendAccountDeletedEmail(to: string, name: string | null) {
  const client = getResend()
  if (!client) return

  const greeting = name ? `Hi ${name}` : "Hi there"
  const signUpUrl = "https://www.onrelay.app/get-started"

  await client.emails.send({
    from: "Relay <support@onrelay.app>",
    to,
    subject: "Your Relay account has been deleted",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting},</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Your Relay account and all associated data have been permanently deleted. This includes your projects, chat transcripts, briefs, and any derived content.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          If you change your mind, you can always create a new account:
        </p>
        <div style="margin: 24px 0;">
          <a href="${signUpUrl}" style="display: inline-block; background: #2563eb; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Sign Up Again</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Thanks for trying Relay. We wish you the best.
        </p>
      </div>
    `
  })
}
