import { createHash } from "crypto"

import { createRepositoryProvider } from "@relay/db"
import { NextResponse } from "next/server"

import { sendEmailVerificationOtp } from "@/server/services/email-service"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      action?: string
      email?: string
      otp?: string
    }

    const { action, email } = body

    if (!email || typeof email !== "string") {
      return NextResponse.json({ error: "email is required." }, { status: 400 })
    }

    if (action === "send") {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      const otpHash = createHash("sha256").update(otp).digest("hex")

      const db = createRepositoryProvider()
      await db.query(
        `INSERT INTO email_otp_tokens (email, otp_hash, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '10 minutes')
         ON CONFLICT (email) DO UPDATE
           SET otp_hash = $2,
               expires_at = NOW() + INTERVAL '10 minutes',
               used_at = NULL`,
        [email, otpHash]
      )

      await sendEmailVerificationOtp(email, otp)

      return NextResponse.json({ ok: true })
    }

    if (action === "verify") {
      const { otp } = body
      if (!otp || typeof otp !== "string") {
        return NextResponse.json({ error: "otp is required." }, { status: 400 })
      }

      const otpHash = createHash("sha256").update(otp).digest("hex")

      const db = createRepositoryProvider()
      const rows = await db.query<{ email: string }>(
        `SELECT email FROM email_otp_tokens
         WHERE email = $1
           AND otp_hash = $2
           AND expires_at > NOW()
           AND used_at IS NULL`,
        [email, otpHash]
      )

      if (rows.length === 0) {
        return NextResponse.json({ error: "Invalid or expired code." }, { status: 400 })
      }

      await db.query(
        `UPDATE email_otp_tokens SET used_at = NOW() WHERE email = $1`,
        [email]
      )

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: "Invalid action." }, { status: 400 })
  } catch (error) {
    console.error("[email-otp]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal error." },
      { status: 500 }
    )
  }
}
