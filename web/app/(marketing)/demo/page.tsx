import Link from 'next/link'
import { ArrowRight, Bot, Clock3, History, Layers3, PlayCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

const siteUrl = 'https://promptomize.app'
const appStoreUrl = 'https://apps.apple.com/us/app/promptomize/id6758075605'
const demoVideoUrl = `${siteUrl}/demo/promptomize-demo.mp4`
const demoPosterUrl = `${siteUrl}/demo/promptomize-demo-poster.jpg`

const primaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-indigo px-5 py-4 text-base font-medium text-white shadow-lg transition-all duration-200 hover:bg-brand-indigo-light hover:shadow-xl hover:shadow-brand-indigo/25'

const secondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-4 text-base font-medium text-white backdrop-blur transition-all duration-200 hover:bg-white/15'

const lightSecondaryButtonClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-4 text-base font-medium text-[var(--text-primary)] transition-all duration-200 hover:bg-[var(--bg-tertiary)]'

const highlights = [
  {
    icon: Bot,
    title: 'Prompt shaping in one pass',
    description:
      'See a rough request become a cleaner, more specific prompt with tone, platform, and detail tuned for the target model.',
  },
  {
    icon: Layers3,
    title: 'Multi-modal workflows',
    description:
      'Promptomize supports text, image, video, audio, code, and 3D prompt enhancement without forcing a new flow for each format.',
  },
  {
    icon: History,
    title: 'Fast iteration loop',
    description:
      'Move from first draft to reusable prompt quickly, then keep refining with history and saved results across devices.',
  },
]

export default function DemoPage() {
  return (
    <div className="bg-[var(--bg-primary)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'VideoObject',
            name: 'Promptomize product demo',
            description:
              'A walkthrough showing Promptomize improving prompts for AI workflows on mobile.',
            thumbnailUrl: [demoPosterUrl],
            uploadDate: '2026-03-11T22:42:08Z',
            contentUrl: demoVideoUrl,
            embedUrl: `${siteUrl}/demo`,
            duration: 'PT1M5S',
            publisher: {
              '@type': 'Organization',
              name: 'Promptomize',
              url: siteUrl,
            },
          }),
        }}
      />

      <section className="relative overflow-hidden bg-gradient-to-b from-[#090915] via-[#0d1022] to-[var(--bg-primary)] px-4 pb-20 pt-20 sm:px-6 lg:px-8">
        <div className="absolute inset-0 opacity-50">
          <div className="absolute left-[-6rem] top-24 h-72 w-72 rounded-full bg-[#5B4CDB]/35 blur-3xl" />
          <div className="absolute bottom-0 right-[-4rem] h-80 w-80 rounded-full bg-[#00E6E6]/20 blur-3xl" />
        </div>

        <div className="relative mx-auto grid max-w-7xl gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="max-w-2xl">
            <Badge variant="cyan" className="mb-6 px-3 py-1 text-sm">
              Live walkthrough
            </Badge>
            <h1 className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Watch Promptomize turn a rough idea into a stronger AI prompt.
            </h1>
            <p className="mb-8 text-lg leading-8 text-gray-300 sm:text-xl">
              This short demo shows the same product flow users get on iPhone and the web:
              fast enhancement, clear formatting, and a workflow built for prompt iteration.
            </p>

            <div className="mb-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/login"
                className={`${primaryButtonClass} w-full sm:w-auto`}
              >
                Try the Web App
                <ArrowRight className="h-5 w-5" aria-hidden="true" />
              </Link>
              <a
                href={appStoreUrl}
                className={`${secondaryButtonClass} w-full sm:w-auto`}
                rel="noopener noreferrer"
              >
                Download for iOS
              </a>
            </div>

            <div className="flex flex-wrap gap-3 text-sm text-gray-300">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
                <PlayCircle className="h-4 w-4 text-[#00E6E6]" aria-hidden="true" />
                65 second walkthrough
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 backdrop-blur">
                <Clock3 className="h-4 w-4 text-[#00E6E6]" aria-hidden="true" />
                Mobile-first flow
              </div>
            </div>
          </div>

          <div className="mx-auto w-full max-w-[420px]">
            <div className="relative rounded-[2.75rem] border border-white/10 bg-[#05070f] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.45)]">
              <div className="pointer-events-none absolute left-1/2 top-3 z-10 h-7 w-40 -translate-x-1/2 rounded-full bg-black/90" />
              <div className="overflow-hidden rounded-[2.2rem] border border-white/10 bg-black">
                <video
                  className="h-auto w-full"
                  controls
                  playsInline
                  preload="metadata"
                  poster="/demo/promptomize-demo-poster.jpg"
                >
                  <source src="/demo/promptomize-demo.mp4" type="video/mp4" />
                  Your browser does not support the demo video.
                </video>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="px-4 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 max-w-2xl">
            <Badge variant="outline" className="mb-4">
              What the demo shows
            </Badge>
            <h2 className="mb-4 text-3xl font-bold text-[var(--text-primary)] sm:text-4xl">
              Same Promptomize visual system, focused on real product behavior.
            </h2>
            <p className="text-lg text-[var(--text-secondary)]">
              The walkthrough highlights how Promptomize guides a user from a short prompt to a
              clearer final result without adding unnecessary friction.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {highlights.map((highlight) => (
              <Card key={highlight.title} variant="elevated" hover className="h-full rounded-3xl">
                <CardContent className="flex h-full flex-col p-8 pt-8">
                  <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-indigo/10 text-brand-indigo dark:bg-brand-cyan/10 dark:text-brand-cyan">
                    <highlight.icon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h3 className="mb-3 text-xl font-semibold text-[var(--text-primary)]">
                    {highlight.title}
                  </h3>
                  <p className="text-[var(--text-secondary)]">{highlight.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Card
            variant="glass"
            className="overflow-hidden rounded-[2rem] border border-brand-indigo/15 bg-gradient-to-r from-brand-indigo/10 via-transparent to-brand-cyan/10"
          >
            <CardContent className="flex flex-col gap-6 p-8 pt-8 lg:flex-row lg:items-center lg:justify-between lg:p-10">
              <div className="max-w-2xl">
                <Badge variant="primary" className="mb-4">
                  Ready to use
                </Badge>
                <h2 className="mb-3 text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">
                  Try the workflow after you watch the demo.
                </h2>
                <p className="text-[var(--text-secondary)]">
                  Open the web app to enhance prompts immediately, or install the iPhone app for a
                  native mobile workflow with the same Promptomize experience.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/login"
                  className={`${primaryButtonClass} justify-center`}
                >
                  Open Web App
                </Link>
                <a
                  href={appStoreUrl}
                  className={`${lightSecondaryButtonClass} justify-center`}
                  rel="noopener noreferrer"
                >
                  View on App Store
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  )
}
