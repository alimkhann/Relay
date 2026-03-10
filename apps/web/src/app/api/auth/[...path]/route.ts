import { requireAuthServer } from "@/lib/auth/server"

export async function GET(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return requireAuthServer().handler().GET(request, context)
}

export async function POST(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return requireAuthServer().handler().POST(request, context)
}

export async function PUT(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return requireAuthServer().handler().PUT(request, context)
}

export async function PATCH(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return requireAuthServer().handler().PATCH(request, context)
}

export async function DELETE(request: Request, context: { params: Promise<{ path: string[] }> }) {
  return requireAuthServer().handler().DELETE(request, context)
}
