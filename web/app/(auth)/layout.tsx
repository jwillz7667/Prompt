import type { Metadata } from 'next'

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
  return (
    <main
      className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)] p-4"
      role="main"
      aria-label="Authentication"
    >
      <div className="w-full max-w-md">
        {children}
      </div>
    </main>
  )
}
