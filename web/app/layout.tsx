import type { Metadata, Viewport } from 'next'
import { Providers } from '@/components/providers'
import './globals.css'

// SEO Best Practices 2026
// - Comprehensive metadata for search engines
// - Structured data for rich snippets
// - Open Graph for social sharing
// - Twitter Card support
// - Proper canonical URLs
// - Mobile-first viewport settings

const siteUrl = 'https://promptomize.app'
const siteName = 'Promptomize'
const siteDescription = 'Transform your prompts into powerful, optimized instructions for AI. Get better results from ChatGPT, Claude, Gemini, and other AI models with advanced prompt engineering.'

export const metadata: Metadata = {
  // Basic metadata
  title: {
    default: 'Promptomize - AI-Powered Prompt Enhancement',
    template: '%s | Promptomize',
  },
  description: siteDescription,

  // SEO keywords (still useful for some search engines)
  keywords: [
    'AI prompt enhancement',
    'prompt engineering',
    'ChatGPT prompts',
    'Claude prompts',
    'Gemini prompts',
    'AI optimization',
    'prompt optimizer',
    'better AI results',
    'prompt templates',
    'AI productivity',
    'prompt generator',
    'LLM prompts',
  ],

  // Authors and publisher
  authors: [{ name: 'Promptomize', url: siteUrl }],
  creator: 'Promptomize',
  publisher: 'Promptomize',

  // Application metadata
  applicationName: 'Promptomize',
  generator: 'Next.js',

  // Robots directives
  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Canonical URL
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/en-US',
    },
  },

  // Open Graph (Facebook, LinkedIn, etc.)
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: siteName,
    title: 'Promptomize - AI-Powered Prompt Enhancement',
    description: siteDescription,
    images: [
      {
        url: `${siteUrl}/logo.png`,
        width: 1024,
        height: 1024,
        alt: 'Promptomize Logo - AI Prompt Enhancement',
        type: 'image/png',
      },
    ],
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    site: '@promptomize',
    creator: '@promptomize',
    title: 'Promptomize - AI-Powered Prompt Enhancement',
    description: siteDescription,
    images: [`${siteUrl}/logo.png`],
  },

  // App icons (auto-detected from /app directory: favicon.ico, icon.png, icon.svg, apple-icon.png)
  // manifest.json is also auto-detected

  // Apple-specific metadata
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Promptomize',
  },

  // App Store link
  appLinks: {
    ios: {
      url: 'https://apps.apple.com/app/promptomize/id6738850382',
      app_store_id: '6738850382',
      app_name: 'Promptomize',
    },
  },

  // Verification for search console (replace with actual values)
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
    // bing: 'your-bing-verification-code',
  },

  // Category for better classification
  category: 'Productivity',

  // Format detection control
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
}

// Viewport configuration (separated from metadata in Next.js 14+)
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FAF9FF' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
  colorScheme: 'dark light',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Google Tag Manager */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-TL8L53P3');`,
          }}
        />
        {/* End Google Tag Manager */}

        {/* Preconnect to external domains for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* DNS prefetch for API */}
        <link rel="dns-prefetch" href="https://backend-production-d538.up.railway.app" />

        {/* Structured data for organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: 'Promptomize',
              url: siteUrl,
              logo: `${siteUrl}/logo.png`,
              description: siteDescription,
              sameAs: [
                'https://apps.apple.com/app/promptomize/id6738850382',
              ],
              contactPoint: {
                '@type': 'ContactPoint',
                contactType: 'customer support',
                url: `${siteUrl}/support`,
              },
            }),
          }}
        />

        {/* Software application structured data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'SoftwareApplication',
              name: 'Promptomize',
              applicationCategory: 'ProductivityApplication',
              operatingSystem: 'iOS, Web',
              offers: {
                '@type': 'AggregateOffer',
                lowPrice: '0',
                highPrice: '9.99',
                priceCurrency: 'USD',
                offerCount: '3',
              },
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: '4.8',
                ratingCount: '1250',
                bestRating: '5',
                worstRating: '1',
              },
            }),
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased">
        {/* Google Tag Manager (noscript) */}
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-TL8L53P3"
            height="0"
            width="0"
            style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {/* End Google Tag Manager (noscript) */}
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
