'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { io, Socket } from 'socket.io-client'
import { getTicketById, replyToTicket, updateTicketStatus, type Ticket } from '@/lib/api/admin'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d7487.up.railway.app'

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  WAITING_ON_USER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const priorityColors: Record<string, string> = {
  URGENT: 'text-red-400 bg-red-500/10',
  HIGH: 'text-orange-400 bg-orange-500/10',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10',
  LOW: 'text-green-400 bg-green-500/10',
}

interface TicketMessage {
  id: string
  role: 'user' | 'assistant' | 'agent'
  content: string
  createdAt: string
  isFromAI: boolean
}

export default function TicketDetailPage() {
  const params = useParams()
  const ticketId = params.id as string
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const socketRef = useRef<Socket | null>(null)

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [userIsTyping, setUserIsTyping] = useState(false)
  const [isConnected, setIsConnected] = useState(false)

  const fetchTicket = useCallback(async () => {
    const apiKey = sessionStorage.getItem('adminApiKey')
    if (!apiKey) return

    setLoading(true)
    setError('')

    try {
      const data = await getTicketById(apiKey, ticketId)
      setTicket(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  // Initialize WebSocket connection
  useEffect(() => {
    const apiKey = sessionStorage.getItem('adminApiKey')
    if (!apiKey || !ticketId) return

    // Connect to Socket.IO server
    const socket = io(API_URL, {
      transports: ['polling', 'websocket'], // Match backend order
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    console.log('[Socket] Connecting to:', API_URL)

    socketRef.current = socket

    socket.on('connect', () => {
      setIsConnected(true)
      console.log('[Socket] Connected, joining room:', ticketId)
      // Join the ticket room
      socket.emit('join:ticket', {
        ticketId,
        role: 'agent',
        apiKey,
      })
    })

    socket.on('disconnect', (reason) => {
      setIsConnected(false)
      console.log('[Socket] Disconnected:', reason)
    })

    socket.on('connect_error', (error) => {
      console.error('[Socket] Connection error:', error)
    })

    socket.on('error', (error) => {
      console.error('[Socket] Error:', error)
    })

    // Listen for new messages
    socket.on('ticket:message', (data: { ticketId: string; message: TicketMessage }) => {
      if (data.ticketId === ticketId) {
        setTicket((prev) => {
          if (!prev) return prev
          // Check if message already exists
          const messageExists = prev.messages?.some((m) => m.id === data.message.id)
          if (messageExists) return prev

          return {
            ...prev,
            messages: [...(prev.messages || []), data.message],
          }
        })
      }
    })

    // Listen for typing indicators
    socket.on('typing:update', (data: { ticketId: string; isTyping: boolean; role: string }) => {
      if (data.ticketId === ticketId && data.role === 'user') {
        setUserIsTyping(data.isTyping)
      }
    })

    // Listen for participant events
    socket.on('participant:joined', (data: { role: string }) => {
      if (data.role === 'user') {
        // User joined the chat
      }
    })

    socket.on('participant:left', (data: { role: string }) => {
      if (data.role === 'user') {
        setUserIsTyping(false)
      }
    })

    return () => {
      socket.emit('leave:ticket', { ticketId })
      socket.disconnect()
      socketRef.current = null
    }
  }, [ticketId])

  useEffect(() => {
    fetchTicket()
  }, [fetchTicket])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [ticket?.messages, userIsTyping])

  // Send typing indicator
  const sendTypingIndicator = useCallback(
    (isTyping: boolean) => {
      if (socketRef.current?.connected) {
        socketRef.current.emit(isTyping ? 'typing:start' : 'typing:stop', {
          ticketId,
          role: 'agent',
        })
      }
    },
    [ticketId],
  )

  const handleReplyChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setReplyText(e.target.value)

    // Send typing indicator
    sendTypingIndicator(true)

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Stop typing indicator after 2 seconds of no input
    typingTimeoutRef.current = setTimeout(() => {
      sendTypingIndicator(false)
    }, 2000)
  }

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!replyText.trim() || sending) return

    const apiKey = sessionStorage.getItem('adminApiKey')
    if (!apiKey) return

    // Stop typing indicator
    sendTypingIndicator(false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    const messageContent = replyText.trim()
    setSending(true)
    setError('')
    setReplyText('')

    // Optimistically add the message to the UI immediately
    const optimisticMessage: TicketMessage = {
      id: `temp-${Date.now()}`,
      role: 'agent',
      content: messageContent,
      createdAt: new Date().toISOString(),
      isFromAI: false,
    }

    setTicket((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        messages: [...(prev.messages || []), optimisticMessage],
      }
    })

    try {
      await replyToTicket(apiKey, ticketId, messageContent)
      // Fetch ticket to get the real message ID and ensure consistency
      await fetchTicket()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply')
      // Remove the optimistic message on error
      setTicket((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          messages: prev.messages?.filter((m) => m.id !== optimisticMessage.id) || [],
        }
      })
      // Restore the message text so user can retry
      setReplyText(messageContent)
    } finally {
      setSending(false)
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    const apiKey = sessionStorage.getItem('adminApiKey')
    if (!apiKey) return

    setUpdatingStatus(true)
    setError('')

    try {
      await updateTicketStatus(
        apiKey,
        ticketId,
        newStatus as 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED',
      )
      await fetchTicket()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"></div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="py-12 text-center">
        <h2 className="mb-2 text-xl font-bold text-white">Ticket not found</h2>
        <p className="mb-4 text-gray-400">
          {error || "The ticket you're looking for doesn't exist."}
        </p>
        <Link
          href="/admin/tickets"
          className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-white transition hover:bg-cyan-500"
        >
          ← Back to Tickets
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            href="/admin/tickets"
            className="mb-3 inline-flex items-center gap-1 text-sm text-gray-400 transition hover:text-white"
          >
            ← Back to Tickets
          </Link>
          <h1 className="text-2xl font-bold text-white">{ticket.subject}</h1>
          <p className="mt-1 text-gray-400">
            #{ticket.id.slice(0, 8).toUpperCase()} · {ticket.category} · Created{' '}
            {formatDate(ticket.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div
            className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-green-400' : 'text-gray-500'}`}
          >
            <div
              className={`h-2 w-2 rounded-full ${isConnected ? 'animate-pulse bg-green-500' : 'bg-gray-500'}`}
            ></div>
            {isConnected ? 'Live' : 'Offline'}
          </div>
          <span
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${priorityColors[ticket.priority] || 'bg-gray-500/10 text-gray-400'}`}
          >
            {ticket.priority}
          </span>
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm font-medium outline-none ${statusColors[ticket.status] || statusColors.OPEN} ${updatingStatus ? 'opacity-50' : ''}`}
          >
            <option value="OPEN">OPEN</option>
            <option value="IN_PROGRESS">IN PROGRESS</option>
            <option value="WAITING_ON_USER">WAITING ON USER</option>
            <option value="RESOLVED">RESOLVED</option>
            <option value="CLOSED">CLOSED</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Info Cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="col-span-2 rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="mb-1 text-sm text-gray-400">User</p>
          <p className="font-medium text-white">{ticket.user?.email || 'Unknown'}</p>
          {ticket.user?.name && <p className="mt-0.5 text-sm text-gray-400">{ticket.user.name}</p>}
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="mb-1 text-sm text-gray-400">Assigned Agent</p>
          <p className="font-medium text-white">{ticket.assignedAgentName || 'Unassigned'}</p>
        </div>
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-4">
          <p className="mb-1 text-sm text-gray-400">Last Updated</p>
          <p className="font-medium text-white">{formatDate(ticket.updatedAt)}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
        <div className="border-b border-gray-700 p-4">
          <h2 className="font-semibold text-white">Conversation</h2>
        </div>

        <div className="max-h-[500px] space-y-4 overflow-y-auto p-4">
          {ticket.messages?.map((message, index) => (
            <div
              key={message.id || index}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-cyan-600 text-white'
                    : message.role === 'agent'
                      ? 'border border-green-500/30 bg-green-600/20 text-white'
                      : 'bg-gray-700 text-white'
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${
                      message.role === 'user'
                        ? 'text-cyan-200'
                        : message.role === 'agent'
                          ? 'text-green-400'
                          : 'text-gray-400'
                    }`}
                  >
                    {message.role === 'user'
                      ? ticket.user?.name || ticket.user?.email || 'User'
                      : message.role === 'agent'
                        ? ticket.assignedAgentName || 'Agent'
                        : 'Prompt Bot'}
                  </span>
                  <span className="text-xs text-gray-400">{formatTime(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

          {/* User typing indicator */}
          {userIsTyping && (
            <div className="flex justify-end">
              <div className="rounded-2xl border border-cyan-500/30 bg-cyan-600/20 px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-cyan-300">
                    {ticket.user?.name || ticket.user?.email || 'User'}
                  </span>
                  <span className="text-xs text-gray-400">is typing</span>
                </div>
                <div className="mt-1 flex gap-1">
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-cyan-400"
                    style={{ animationDelay: '0ms' }}
                  ></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-cyan-400"
                    style={{ animationDelay: '150ms' }}
                  ></div>
                  <div
                    className="h-2 w-2 animate-bounce rounded-full bg-cyan-400"
                    style={{ animationDelay: '300ms' }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Reply Form */}
        {ticket.status !== 'CLOSED' && (
          <form onSubmit={handleSendReply} className="border-t border-gray-700 p-4">
            <div className="flex gap-3">
              <textarea
                value={replyText}
                onChange={handleReplyChange}
                placeholder="Type your reply..."
                rows={3}
                className="flex-1 resize-none rounded-xl border border-gray-600 bg-gray-900 px-4 py-3 text-white placeholder-gray-500 outline-none transition focus:border-transparent focus:ring-2 focus:ring-cyan-500"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sending}
                className="self-end rounded-xl bg-cyan-600 px-6 py-3 font-semibold text-white transition hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                    Sending...
                  </span>
                ) : (
                  'Send Reply'
                )}
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Your reply will be sent to the user via email and appear in their app in real-time.
            </p>
          </form>
        )}

        {ticket.status === 'CLOSED' && (
          <div className="bg-gray-750 border-t border-gray-700 p-4">
            <p className="text-center text-gray-400">
              This ticket is closed. Change status to reply.
            </p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      {ticket.status !== 'CLOSED' && ticket.status !== 'RESOLVED' && (
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={() => handleStatusChange('RESOLVED')}
            disabled={updatingStatus}
            className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white transition hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            {updatingStatus ? 'Updating...' : 'Mark Resolved'}
          </button>
          <button
            onClick={() => handleStatusChange('CLOSED')}
            disabled={updatingStatus}
            className="rounded-lg bg-gray-600 px-4 py-2 font-medium text-white transition hover:bg-gray-500 disabled:bg-gray-700 disabled:text-gray-500"
          >
            {updatingStatus ? 'Updating...' : 'Close Ticket'}
          </button>
        </div>
      )}
    </div>
  )
}
