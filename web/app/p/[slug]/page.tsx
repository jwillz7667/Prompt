import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowRight, Sparkles, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { CopyablePrompt } from './CopyablePrompt'
import { getSharedPrompt, modalityLabel } from './shared-prompt'

const SITE_URL = 'https://promptomize.app'

interface PageProps {
  params: { slug: string }
}

function truncate(value: string, max: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= max) {
    return normalized
  }
  return `${normalized.slice(0, max - 1).trimEnd()}…`
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'long' }).format(date)
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const shared = await getSharedPrompt(params.slug)

  if (!shared) {
    return {
      title: 'Shared Prompt',
      robots: { index: false, follow: false },
    }
  }

  const title = shared.title?.trim() || 'Shared Prompt'
  const description = truncate(shared.enhancedPrompt, 150)
  const url = `${SITE_URL}/p/${params.slug}`

  return {
    title,
    description,
    alternates: { canonical: `/p/${params.slug}` },
    openGraph: {
      type: 'article',
      url,
      title,
      description,
      siteName: 'Promptomize',
      images: [`${SITE_URL}/logo.png`],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/logo.png`],
    },
  }
}

export default async function SharedPromptPage({ params }: PageProps) {
  const shared = await getSharedPrompt(params.slug)

  if (!shared) {
    notFound()
  }

  const title = shared.title?.trim() || 'Shared Prompt'
  const sharedDate = formatDate(shared.sharedAt)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[var(--border)]">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-indigo dark:bg-brand-cyan">
              <Zap className="h-4 w-4 text-white dark:text-black" />
            </div>
            <span className="text-lg font-bold gradient-text">Promptomize</span>
          </Link>
          <Link
            href="/"
            className="btn-cyan rounded-xl px-4 py-2 text-sm font-medium"
          >
            Try it free
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Badge variant="primary">{modalityLabel(shared.modality)}</Badge>
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">
              AI-enhanced
            </span>
          </div>

          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)] sm:text-4xl">
            {title}
          </h1>

          {sharedDate ? (
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">
              Shared on {sharedDate}
            </p>
          ) : null}

          <section className="mt-8">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-brand-indigo dark:text-brand-cyan" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
                Enhanced prompt
              </h2>
            </div>
            <CopyablePrompt text={shared.enhancedPrompt} />
          </section>

          <details className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]">
            <summary className="cursor-pointer select-none list-none px-5 py-4 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
              View original prompt
            </summary>
            <div className="border-t border-[var(--border)] px-5 py-4">
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-[var(--text-tertiary)]">
                {shared.originalPrompt}
              </pre>
            </div>
          </details>

          <aside className="mt-10 overflow-hidden rounded-2xl border border-[var(--border)] bg-gradient-brand p-[1px]">
            <div className="rounded-2xl bg-[var(--bg-secondary)] px-6 py-6 sm:px-8 sm:py-7">
              <p className="text-sm font-semibold uppercase tracking-wide gradient-text">
                Enhanced with Promptomize
              </p>
              <h3 className="mt-2 text-xl font-bold text-[var(--text-primary)] sm:text-2xl">
                Turn your rough ideas into powerful AI prompts.
              </h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                Promptomize rewrites and optimizes your prompts for any AI
                platform, so you get better results in seconds.
              </p>
              <Link
                href={SITE_URL}
                className="btn-cyan mt-5 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium"
              >
                Create your own
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </article>
      </main>
    </div>
  )
}
