import type { Metadata } from 'next'
import { AuthLayoutClient } from './layout-client'

export const metadata: Metadata = {
  title: 'Sign In',
  description: 'Sign in to Promptomize to enhance your AI prompts. Use Apple or Google to get started.',
  robots: {
    index: false, // Don't index login pages
    follow: true,
  },
}

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthLayoutClient>{children}</AuthLayoutClient>
}
