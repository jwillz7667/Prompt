import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Promptomize - AI-Powered Prompt Enhancement',
  description: 'Transform your prompts into powerful, optimized instructions for AI. Get better results from ChatGPT, Claude, and other AI models.',
  keywords: ['AI', 'prompts', 'prompt engineering', 'ChatGPT', 'Claude', 'AI optimization'],
  authors: [{ name: 'Promptomize' }],
  openGraph: {
    title: 'Promptomize - AI-Powered Prompt Enhancement',
    description: 'Transform your prompts into powerful, optimized instructions for AI.',
    url: 'https://promptomize.com',
    siteName: 'Promptomize',
    images: [
      {
        url: 'https://promptomize.com/app-icon.png',
        width: 1024,
        height: 1024,
        alt: 'Promptomize Logo',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Promptomize - AI-Powered Prompt Enhancement',
    description: 'Transform your prompts into powerful, optimized instructions for AI.',
    images: ['https://promptomize.com/app-icon.png'],
  },
  icons: {
    icon: '/app-icon.png',
    apple: '/app-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        {children}
      </body>
    </html>
  )
}
