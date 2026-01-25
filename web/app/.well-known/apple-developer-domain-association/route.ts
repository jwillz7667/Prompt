import { NextResponse } from 'next/server'

// Apple domain verification file
// Replace this content with the actual content from Apple Developer Console
const VERIFICATION_CONTENT = `REPLACE_WITH_APPLE_VERIFICATION_CONTENT`

export async function GET() {
  return new NextResponse(VERIFICATION_CONTENT, {
    headers: {
      'Content-Type': 'text/plain',
    },
  })
}
