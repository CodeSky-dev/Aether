import { createNextAuthHandler } from '@aether/auth'
import { getAuth } from '@/lib/auth'

export async function GET(request: Request): Promise<Response> {
  return createNextAuthHandler(getAuth()).GET(request)
}

export async function POST(request: Request): Promise<Response> {
  return createNextAuthHandler(getAuth()).POST(request)
}

export async function PATCH(request: Request): Promise<Response> {
  return createNextAuthHandler(getAuth()).PATCH(request)
}

export async function PUT(request: Request): Promise<Response> {
  return createNextAuthHandler(getAuth()).PUT(request)
}

export async function DELETE(request: Request): Promise<Response> {
  return createNextAuthHandler(getAuth()).DELETE(request)
}
