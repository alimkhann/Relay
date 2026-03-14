import { NextResponse } from "next/server"

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: "Extension web pairing has been removed. Use Google sign-in from the extension." },
    { status: 410 }
  )
}
