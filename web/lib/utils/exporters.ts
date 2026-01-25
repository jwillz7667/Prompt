import { jsPDF } from 'jspdf'
import type { Prompt } from '@/lib/types/models'
import { format } from 'date-fns'

export function exportToText(prompts: Prompt[]): string {
  return prompts
    .map((prompt, index) => {
      const header = `═══════════════════════════════════════════════════════════════
PROMPT ${index + 1}
Created: ${format(new Date(prompt.createdAt), 'MMMM d, yyyy h:mm a')}
═══════════════════════════════════════════════════════════════`

      const original = `
ORIGINAL:
${prompt.originalPrompt}
`

      const enhanced = `
ENHANCED:
${prompt.enhancedPrompt}
`

      return `${header}${original}${enhanced}`
    })
    .join('\n\n')
}

export function exportToMarkdown(prompts: Prompt[]): string {
  const header = `# Promptomize Export
Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')}

---

`

  const content = prompts
    .map((prompt, index) => {
      return `## Prompt ${index + 1}
*Created: ${format(new Date(prompt.createdAt), 'MMMM d, yyyy h:mm a')}*

### Original
\`\`\`
${prompt.originalPrompt}
\`\`\`

### Enhanced
\`\`\`
${prompt.enhancedPrompt}
\`\`\`

---
`
    })
    .join('\n')

  return header + content
}

export function exportToPDF(prompts: Prompt[]): Blob {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const maxWidth = pageWidth - 2 * margin
  let yPosition = margin

  // Title
  doc.setFontSize(24)
  doc.setTextColor(91, 76, 219) // Brand indigo
  doc.text('Promptomize Export', margin, yPosition)
  yPosition += 10

  // Subtitle
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Generated on ${format(new Date(), 'MMMM d, yyyy h:mm a')}`, margin, yPosition)
  yPosition += 15

  prompts.forEach((prompt, index) => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage()
      yPosition = margin
    }

    // Prompt header
    doc.setFontSize(14)
    doc.setTextColor(91, 76, 219)
    doc.text(`Prompt ${index + 1}`, margin, yPosition)
    yPosition += 6

    doc.setFontSize(8)
    doc.setTextColor(100)
    doc.text(format(new Date(prompt.createdAt), 'MMMM d, yyyy h:mm a'), margin, yPosition)
    yPosition += 10

    // Original
    doc.setFontSize(10)
    doc.setTextColor(60)
    doc.text('Original:', margin, yPosition)
    yPosition += 6

    doc.setFontSize(9)
    doc.setTextColor(40)
    const originalLines = doc.splitTextToSize(prompt.originalPrompt, maxWidth)
    doc.text(originalLines, margin, yPosition)
    yPosition += originalLines.length * 5 + 8

    // Enhanced
    if (yPosition > 250) {
      doc.addPage()
      yPosition = margin
    }

    doc.setFontSize(10)
    doc.setTextColor(0, 200, 200) // Cyan
    doc.text('Enhanced:', margin, yPosition)
    yPosition += 6

    doc.setFontSize(9)
    doc.setTextColor(40)
    const enhancedLines = doc.splitTextToSize(prompt.enhancedPrompt, maxWidth)
    doc.text(enhancedLines, margin, yPosition)
    yPosition += enhancedLines.length * 5 + 15

    // Divider
    if (index < prompts.length - 1) {
      doc.setDrawColor(200)
      doc.line(margin, yPosition - 5, pageWidth - margin, yPosition - 5)
    }
  })

  return doc.output('blob')
}

export function downloadFile(content: string | Blob, filename: string, mimeType: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
