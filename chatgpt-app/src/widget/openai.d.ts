import type {
  CapabilitiesPayload,
  EnhanceResponsePayload,
} from '../shared/types'

type CallToolResult<T = unknown> =
  | T
  | {
      structuredContent?: T
      content?: Array<{ type: string; text?: string }>
      isError?: boolean
    }

declare global {
  interface Window {
    openai?: {
      theme?: 'light' | 'dark'
      toolOutput?: EnhanceResponsePayload | null
      widgetState?: Record<string, unknown> | null
      callTool?: <T = unknown>(name: string, args?: Record<string, unknown>) => Promise<CallToolResult<T>>
      openExternal?: (options: { href: string }) => Promise<unknown> | unknown
      setWidgetState?: (state: Record<string, unknown>) => Promise<void> | void
    }
  }
}

export {}
