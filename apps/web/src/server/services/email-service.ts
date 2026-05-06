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
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: "Welcome to Relay",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting}, welcome to Relay!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Relay keeps your project brief ready across the AI tools you use, from browser chats to MCP-connected coding agents.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Start by creating your first project, then connect Chrome whenever you are ready to capture context from supported AI chats.
        </p>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open Dashboard</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Need help? Check out the <a href="${docsUrl}" style="color: #182017;">getting started guide</a>.
        </p>
      </div>
    `
  })
}

export async function sendBetaInviteEmail(to: string, inviteLink: string) {
  const client = getResend()
  if (!client) return

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: "You're invited to the Relay closed beta",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">You're in!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          You've been invited to the Relay closed beta. Relay keeps your project brief ready across supported browser chats and MCP-connected coding agents.
        </p>
        <div style="margin: 24px 0;">
          <a href="${inviteLink}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Accept Invite</a>
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
    from: "Relay <noreply@onrelay.app>",
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
    from: "Relay <noreply@onrelay.app>",
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
          <a href="${billingUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Upgrade Now</a>
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
    from: "Relay <noreply@onrelay.app>",
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
          <a href="${signUpUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Sign Up Again</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Thanks for trying Relay. We wish you the best.
        </p>
      </div>
    `
  })
}

export async function sendBetaAccessGrantedEmail(to: string, name: string | null) {
  const client = getResend()
  if (!client) return

  const greeting = name ? `Hi ${name}` : "Hi there"
  const dashboardUrl = "https://www.onrelay.app/dashboard"

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: "Your Relay beta access is ready",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting}, your beta access is ready!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Congratulations &mdash; you're in! Your Relay beta access has been activated and you can start using it right away.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Head to your dashboard to set up your first project, then install the Chrome extension to keep context moving across supported AI chats and your coding tools.
        </p>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open Dashboard</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Have feedback or run into issues? Reply to this email &mdash; we read everything.
        </p>
      </div>
    `
  })
}

export async function sendWelcomeToProEmail(
  to: string,
  input: { name: string | null; plan: "Starter" | "Pro"; interval: "month" | "year" | null; currentPeriodEnd: string | null },
) {
  const client = getResend()
  if (!client) return

  const greeting = input.name ? `Hi ${input.name}` : "Hi there"
  const billingUrl = "https://www.onrelay.app/settings?section=billing"
  const dashboardUrl = "https://www.onrelay.app/dashboard"
  const intervalLabel = input.interval === "year" ? "yearly" : "monthly"
  const renewalNote = input.currentPeriodEnd
    ? `Your next ${intervalLabel} renewal is on ${new Date(input.currentPeriodEnd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`
    : `Your ${input.plan} subscription is active on the ${intervalLabel} plan.`

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: `Welcome to Relay ${input.plan}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting}, welcome to Relay ${input.plan}!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Thanks for upgrading. Your account has been switched to the ${input.plan} plan with higher daily limits, more active projects, and deeper context across ChatGPT, Claude, Gemini, Grok, and Perplexity.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          ${renewalNote} You can manage or cancel your subscription any time from the billing settings.
        </p>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; margin-right: 8px;">Open Dashboard</a>
          <a href="${billingUrl}" style="display: inline-block; color: #182017; padding: 12px 24px; text-decoration: none; font-weight: 500;">Manage Billing →</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Questions or feedback? Reply to this email &mdash; we read everything.
        </p>
      </div>
    `,
  })
}

export async function sendSubscriptionCanceledEmail(
  to: string,
  input: { name: string | null; plan: "Starter" | "Pro"; currentPeriodEnd: string | null },
) {
  const client = getResend()
  if (!client) return

  const greeting = input.name ? `Hi ${input.name}` : "Hi there"
  const billingUrl = "https://www.onrelay.app/settings?section=billing"
  const endNote = input.currentPeriodEnd
    ? `Your ${input.plan} features will remain active until ${new Date(input.currentPeriodEnd).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}, then your account will switch to the free plan.`
    : `Your ${input.plan} features have ended and your account is now on the free plan.`

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: `Your Relay ${input.plan} subscription has been canceled`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting},</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          We've received the cancellation for your Relay ${input.plan} subscription. ${endNote}
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Your projects, memory items, and data stay put &mdash; you'll just fall back to the free plan's limits. You can resubscribe any time.
        </p>
        <div style="margin: 24px 0;">
          <a href="${billingUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Manage Billing</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          If this was a mistake or you'd like to share feedback, reply to this email &mdash; we read everything.
        </p>
      </div>
    `,
  })
}

export async function sendTrialStartedEmail(to: string, name: string | null, trialDays: number) {
  const client = getResend()
  if (!client) return

  const greeting = name ? `Hi ${name}` : "Hi there"
  const dashboardUrl = "https://www.onrelay.app/dashboard"

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: "Your Relay Pro trial has started",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">${greeting}, your Pro trial is live!</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Your ${trialDays}-day Relay Pro trial has started. You now have access to higher daily limits, more project capacity, and more room for saved context.
        </p>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Make the most of your trial by heading to the dashboard, setting up your projects, and connecting the tools you use most.
        </p>
        <div style="margin: 24px 0;">
          <a href="${dashboardUrl}" style="display: inline-block; background: #182017; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">Open Dashboard</a>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          Your trial lasts ${trialDays} days. We'll send you a reminder before it ends.
        </p>
      </div>
    `
  })
}

export async function sendEmailVerificationOtp(to: string, otp: string) {
  const client = getResend()
  if (!client) return

  await client.emails.send({
    from: "Relay <noreply@onrelay.app>",
    to,
    subject: "Your Relay verification code",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 600; margin-bottom: 16px;">Verify your email</h1>
        <p style="font-size: 16px; line-height: 1.5; color: #374151;">
          Enter this 6-digit code to confirm your Relay account. It expires in 10 minutes.
        </p>
        <div style="margin: 32px 0; text-align: center;">
          <div style="display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 40px;">
            <span style="font-size: 40px; font-weight: 700; letter-spacing: 8px; font-family: monospace; color: #182017;">${otp}</span>
          </div>
        </div>
        <p style="font-size: 14px; color: #6b7280;">
          If you didn't request this code, you can safely ignore this email.
        </p>
      </div>
    `
  })
}
