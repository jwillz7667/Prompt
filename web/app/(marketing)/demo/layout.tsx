import type { Metadata } from 'next'

const demoTitle = 'Product Demo - Promptomize'
const demoDescription =
  'Watch Promptomize turn a rough idea into a polished AI prompt with the same fast, native workflow available on iOS and the web.'

export const metadata: Metadata = {
  title: demoTitle,
  description: demoDescription,
  keywords: [
    'Promptomize demo',
    'AI prompt demo video',
    'prompt engineering walkthrough',
    'ChatGPT prompt optimizer demo',
    'Promptomize app demo',
  ],
  openGraph: {
    title: demoTitle,
    description: demoDescription,
    url: 'https://promptomize.app/demo',
    type: 'video.other',
    images: [
      {
        url: 'https://promptomize.app/demo/promptomize-demo-poster.jpg',
        width: 720,
        height: 1566,
        alt: 'Promptomize demo video poster',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: demoTitle,
    description: demoDescription,
    images: ['https://promptomize.app/demo/promptomize-demo-poster.jpg'],
  },
  alternates: {
    canonical: '/demo',
  },
}

export default function DemoLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
