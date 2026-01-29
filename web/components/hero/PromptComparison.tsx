'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Multiple example prompts that cycle through
const EXAMPLES = [
  {
    basic: {
      prompt: "Write about dogs",
      response: "Dogs are pets. They are friendly animals that people keep at home. They can bark and run."
    },
    enhanced: {
      prompt: `You are a veterinary behaviorist with 20 years of research experience. Write a compelling, scientifically-accurate article about the cognitive abilities of dogs.

Include:
• Recent research on emotional intelligence
• Problem-solving capabilities with specific studies
• Engaging storytelling approach`,
      response: `# The Remarkable Mind of Canis Familiaris

Recent studies at the Family Dog Project in Budapest have revealed something extraordinary: dogs possess cognitive abilities that rival those of a 2-year-old human child.

## Emotional Intelligence Beyond Instinct

Dr. Brian Hare's research at Duke University demonstrated that dogs can read human emotions through facial expressions alone...`
    }
  },
  {
    basic: {
      prompt: "Help me with my resume",
      response: "Make sure your resume is clear and lists your jobs and skills. Keep it to one page if possible."
    },
    enhanced: {
      prompt: `You are an executive recruiter at a Fortune 500 company with 15 years of hiring experience. Review my resume for a Senior Software Engineer position.

Analyze:
• ATS optimization and keyword density
• Impact metrics and quantifiable achievements
• Role-specific skill alignment
• Format and structure best practices`,
      response: `# Executive Resume Analysis

## ATS Optimization Score: 72/100

### Critical Improvements Needed:

**1. Quantify Your Impact**
Current: "Led development team"
Suggested: "Led 8-person engineering team, delivering $2.4M revenue feature 3 weeks ahead of schedule"

**2. Missing Keywords**
Your resume lacks: CI/CD, Agile, System Design...`
    }
  },
  {
    basic: {
      prompt: "Write a poem about the moon",
      response: "The moon is bright,\nUp in the night,\nIt shines so white,\nA lovely sight."
    },
    enhanced: {
      prompt: `You are a poet laureate combining the styles of Pablo Neruda's sensuality and Mary Oliver's nature observations. Compose a poem about the moon.

Requirements:
• Use vivid sensory imagery
• Employ metaphor and personification
• Create emotional resonance
• 3-4 stanzas with varied line lengths`,
      response: `# Lunar Confession

She rises like a secret
the ocean has kept for millennia—
silver-tongued confessor
to every sleepless window.

Tonight she wears the clouds
like a shawl of grey moth wings,
and I understand finally
why the tides cannot help themselves,

why wolves compose their throats
into instruments of longing...`
    }
  },
  {
    basic: {
      prompt: "Explain quantum computing",
      response: "Quantum computing uses quantum bits instead of regular bits. It can solve complex problems faster than normal computers."
    },
    enhanced: {
      prompt: `You are Richard Feynman reincarnated as a modern quantum physicist and science communicator. Explain quantum computing to a curious high schooler.

Use:
• Analogies from everyday life
• Build concepts progressively
• Address common misconceptions
• Include one "mind-blowing" implication`,
      response: `# Quantum Computing: The Universe's Cheat Code

Imagine you're lost in a maze. A regular computer tries every path one by one—left, dead end, backtrack, right, dead end...

**A quantum computer? It walks every path simultaneously.**

## The Qubit: Schrödinger's Coin

Flip a coin. Heads or tails, right? A quantum bit (qubit) is like a coin spinning in the air—it's BOTH heads AND tails until you look at it...`
    }
  }
]

// Typing speed configuration (ms per character)
const TYPING_SPEED = {
  fast: 8,
  normal: 12,
}

interface TerminalProps {
  label: string
  labelColor: string
  glowColor: string
  prompt: string
  response: string
  startDelay: number
  isActive: boolean
  onComplete?: () => void
}

function useTypewriter(
  text: string,
  isActive: boolean,
  startDelay: number,
  speed: number = TYPING_SPEED.normal,
  onComplete?: () => void
) {
  const [displayedText, setDisplayedText] = useState('')
  const [isComplete, setIsComplete] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setDisplayedText('')
      setIsComplete(false)
      setIsTyping(false)
      return
    }

    let timeoutId: NodeJS.Timeout
    let intervalId: NodeJS.Timeout

    timeoutId = setTimeout(() => {
      setIsTyping(true)
      let currentIndex = 0

      intervalId = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1))
          currentIndex++
        } else {
          clearInterval(intervalId)
          setIsComplete(true)
          setIsTyping(false)
          onComplete?.()
        }
      }, speed)
    }, startDelay)

    return () => {
      clearTimeout(timeoutId)
      clearInterval(intervalId)
    }
  }, [text, isActive, startDelay, speed, onComplete])

  return { displayedText, isComplete, isTyping }
}

function Terminal({ label, labelColor, glowColor, prompt, response, startDelay, isActive, onComplete }: TerminalProps) {
  const [responseComplete, setResponseComplete] = useState(false)

  const handlePromptComplete = useCallback(() => {
    // Prompt done, response will start
  }, [])

  const handleResponseComplete = useCallback(() => {
    setResponseComplete(true)
    onComplete?.()
  }, [onComplete])

  const { displayedText: promptText, isComplete: promptComplete, isTyping: promptTyping } = useTypewriter(
    prompt,
    isActive,
    startDelay,
    TYPING_SPEED.fast,
    handlePromptComplete
  )

  const { displayedText: responseText, isTyping: responseTyping } = useTypewriter(
    response,
    promptComplete,
    600,
    TYPING_SPEED.normal,
    handleResponseComplete
  )

  const terminalRef = useRef<HTMLDivElement>(null)

  // Reset state when prompt changes
  useEffect(() => {
    setResponseComplete(false)
  }, [prompt])

  // Auto-scroll to bottom as content appears
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight
    }
  }, [promptText, responseText])

  const showCursor = promptTyping || responseTyping

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, delay: startDelay / 1000, ease: [0.23, 1, 0.32, 1] }}
      className="relative group"
    >
      {/* Glow effect */}
      <div
        className="absolute -inset-1 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"
        style={{ background: `linear-gradient(135deg, ${glowColor}40, ${glowColor}20)` }}
      />

      {/* Terminal window */}
      <div className="relative bg-[#0a0a0f] rounded-2xl border border-white/10 overflow-hidden shadow-2xl">
        {/* Terminal header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#111118] border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
              <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
              <div className="w-3 h-3 rounded-full bg-[#28c840]" />
            </div>
          </div>
          <span
            className="text-xs font-mono font-semibold tracking-wider uppercase px-3 py-1 rounded-full"
            style={{
              color: labelColor,
              backgroundColor: `${labelColor}15`,
              border: `1px solid ${labelColor}30`
            }}
          >
            {label}
          </span>
          <div className="w-16" />
        </div>

        {/* Terminal content */}
        <div
          ref={terminalRef}
          className="h-[280px] md:h-[340px] overflow-y-auto p-5 font-mono text-sm leading-relaxed scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        >
          {/* Prompt section */}
          <div className="mb-4">
            <div className="flex items-start gap-2">
              <span className="text-emerald-400 select-none shrink-0">❯</span>
              <div className="flex-1">
                <span className="text-gray-400">prompt: </span>
                <span className="text-white whitespace-pre-wrap">{promptText}</span>
                {promptTyping && <Cursor />}
              </div>
            </div>
          </div>

          {/* Response section */}
          <AnimatePresence>
            {promptComplete && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
              >
                <div className="border-t border-white/5 pt-4 mt-4">
                  <div className="flex items-start gap-2">
                    <span className="text-blue-400 select-none shrink-0">◆</span>
                    <div className="flex-1">
                      <span className="text-gray-500 text-xs uppercase tracking-wider mb-2 block">AI Response</span>
                      <div className="text-gray-300 whitespace-pre-wrap">
                        {responseText}
                        {responseTyping && <Cursor />}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Idle cursor when nothing is typing */}
          {!showCursor && !promptComplete && isActive && (
            <div className="flex items-center gap-2 opacity-50">
              <span className="text-emerald-400">❯</span>
              <Cursor />
            </div>
          )}
        </div>

        {/* Progress indicator */}
        {responseComplete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute bottom-3 right-3"
          >
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Complete
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

function Cursor() {
  return (
    <motion.span
      animate={{ opacity: [1, 0] }}
      transition={{ duration: 0.6, repeat: Infinity, repeatType: 'reverse' }}
      className="inline-block w-2 h-5 bg-white/80 ml-0.5 align-middle"
    />
  )
}

// Example indicator dots
function ExampleIndicator({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          animate={{
            scale: i === current ? 1.2 : 1,
            backgroundColor: i === current ? '#00E6E6' : 'rgba(255,255,255,0.2)'
          }}
          transition={{ duration: 0.3 }}
          className="w-2 h-2 rounded-full"
        />
      ))}
    </div>
  )
}

export default function PromptComparison() {
  const [isVisible, setIsVisible] = useState(false)
  const [currentExample, setCurrentExample] = useState(0)
  const [animationPhase, setAnimationPhase] = useState<'idle' | 'playing' | 'transitioning'>('idle')
  const [bothComplete, setBothComplete] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const completedCount = useRef(0)

  // Start animation when component becomes visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && animationPhase === 'idle') {
          setIsVisible(true)
          setAnimationPhase('playing')
        }
      },
      { threshold: 0.2 }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [animationPhase])

  // Handle completion of both terminals
  const handleTerminalComplete = useCallback(() => {
    completedCount.current += 1
    if (completedCount.current >= 2) {
      setBothComplete(true)
    }
  }, [])

  // Cycle to next example after both complete
  useEffect(() => {
    if (!bothComplete) return

    const timer = setTimeout(() => {
      setAnimationPhase('transitioning')

      // Small delay for fade out
      setTimeout(() => {
        completedCount.current = 0
        setBothComplete(false)
        setCurrentExample(prev => (prev + 1) % EXAMPLES.length)
        setAnimationPhase('playing')
      }, 400)
    }, 2500) // Pause to let users read

    return () => clearTimeout(timer)
  }, [bothComplete])

  const example = EXAMPLES[currentExample]

  return (
    <section
      ref={containerRef}
      className="relative py-16 md:py-24 overflow-hidden"
      aria-labelledby="comparison-heading"
    >
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/4 w-[600px] h-[600px] bg-red-500/5 rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute top-1/2 right-1/4 w-[600px] h-[600px] bg-emerald-500/5 rounded-full blur-3xl -translate-y-1/2" />
      </div>

      {/* Scanlines overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.015]"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-12 md:mb-16"
        >
          <h2
            id="comparison-heading"
            className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 tracking-tight"
          >
            See the{' '}
            <span className="relative">
              <span className="gradient-text">Difference</span>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={isVisible ? { scaleX: 1 } : {}}
                transition={{ duration: 0.8, delay: 0.3 }}
                className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-[#5B4CDB] to-[#00E6E6] origin-left rounded-full"
              />
            </span>
          </h2>
          <p className="text-[var(--text-secondary)] text-lg max-w-2xl mx-auto">
            Watch how Promptomize transforms simple prompts into powerful,
            detailed instructions that get dramatically better results.
          </p>
        </motion.div>

        {/* Example indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={isVisible ? { opacity: 1 } : {}}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <ExampleIndicator total={EXAMPLES.length} current={currentExample} />
        </motion.div>

        {/* Terminal comparison grid */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentExample}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: animationPhase === 'transitioning' ? 0 : 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="grid lg:grid-cols-2 gap-6 lg:gap-8"
          >
            <Terminal
              label="Before"
              labelColor="#f87171"
              glowColor="#ef4444"
              prompt={example.basic.prompt}
              response={example.basic.response}
              startDelay={300}
              isActive={animationPhase === 'playing'}
              onComplete={handleTerminalComplete}
            />
            <Terminal
              label="After Promptomize"
              labelColor="#4ade80"
              glowColor="#22c55e"
              prompt={example.enhanced.prompt}
              response={example.enhanced.response}
              startDelay={2000}
              isActive={animationPhase === 'playing'}
              onComplete={handleTerminalComplete}
            />
          </motion.div>
        </AnimatePresence>

        {/* Comparison stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="mt-12 grid grid-cols-3 gap-4 max-w-2xl mx-auto"
        >
          {[
            { value: '10x', label: 'More Detail' },
            { value: '5x', label: 'Better Structure' },
            { value: '∞', label: 'Better Results' },
          ].map((stat, i) => (
            <div
              key={i}
              className="text-center p-4 rounded-2xl bg-white/5 border border-white/10"
            >
              <div className="text-2xl md:text-3xl font-bold gradient-text mb-1">
                {stat.value}
              </div>
              <div className="text-xs md:text-sm text-[var(--text-secondary)]">
                {stat.label}
              </div>
            </div>
          ))}
        </motion.div>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={isVisible ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 1 }}
          className="mt-12 text-center"
        >
          <a
            href="https://apps.apple.com/app/promptomize/id6738850382"
            className="inline-flex items-center gap-3 btn-cyan px-8 py-4 rounded-2xl font-semibold text-lg group"
            rel="noopener noreferrer"
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            Transform Your Prompts
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="inline-block"
            >
              →
            </motion.span>
          </a>
        </motion.div>
      </div>
    </section>
  )
}
