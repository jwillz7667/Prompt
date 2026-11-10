'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getTickets, type Ticket } from '@/lib/api/admin'

// Helper to check if ticket has unread messages (last message is from user)
const hasUnreadMessages = (ticket: Ticket): boolean => {
  if (!ticket.messages || ticket.messages.length === 0) return false
  const lastMessage = ticket.messages[ticket.messages.length - 1]
  // Ticket is "unread" if last message is from user and ticket is not closed/resolved
  return lastMessage.role === 'user' && !['CLOSED', 'RESOLVED'].includes(ticket.status)
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  WAITING_ON_USER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
}

const priorityColors: Record<string, string> = {
  URGENT: 'text-red-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-yellow-400',
  LOW: 'text-green-400',
}

export default function TicketsPage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const fetchTickets = async () => {
    const apiKey = sessionStorage.getItem('adminApiKey')
    if (!apiKey) return

    setLoading(true)
    setError('')

    try {
      const data = await getTickets(apiKey, statusFilter || undefined)
      setTickets(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tickets')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTickets()
  }, [statusFilter])

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Support Tickets</h1>
            {/* Unread count badge */}
            {tickets.filter(hasUnreadMessages).length > 0 && (
              <span className="rounded-full bg-cyan-500 px-2.5 py-1 text-sm font-semibold text-white">
                {tickets.filter(hasUnreadMessages).length} awaiting reply
              </span>
            )}
          </div>
          <p className="mt-1 text-gray-400">Manage customer support requests</p>
        </div>

        <div className="flex items-center gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white outline-none focus:border-transparent focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">All Status</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="WAITING_ON_USER">Waiting on User</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <button
            onClick={fetchTickets}
            className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white transition hover:bg-gray-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent"></div>
        </div>
      ) : tickets.length === 0 ? (
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-800">
            <svg
              className="h-8 w-8 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
              />
            </svg>
          </div>
          <h3 className="mb-1 text-lg font-medium text-white">No tickets found</h3>
          <p className="text-gray-400">
            {statusFilter ? `No tickets with status "${statusFilter}"` : 'No support tickets yet'}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Ticket</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">User</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Priority</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-400">Created</th>
                <th className="px-6 py-4 text-right text-sm font-medium text-gray-400">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {tickets.map((ticket) => {
                const isUnread = hasUnreadMessages(ticket)
                return (
                  <tr
                    key={ticket.id}
                    className={`hover:bg-gray-750 transition ${isUnread ? 'bg-cyan-500/5' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2">
                        {/* Unread indicator dot */}
                        {isUnread && (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-cyan-500" />
                        )}
                        <div>
                          <p className={`font-medium ${isUnread ? 'text-white' : 'text-white'}`}>
                            {ticket.subject}
                            {isUnread && (
                              <span className="ml-2 inline-flex rounded bg-cyan-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                                NEW
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-sm text-gray-500">
                            #{ticket.id.slice(0, 8).toUpperCase()} · {ticket.category}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm text-white">{ticket.user?.email || 'Unknown'}</p>
                        {ticket.user?.name && (
                          <p className="mt-0.5 text-xs text-gray-500">{ticket.user.name}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusColors[ticket.status] || statusColors.OPEN}`}
                      >
                        {ticket.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-medium ${priorityColors[ticket.priority] || 'text-gray-400'}`}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-400">{formatDate(ticket.createdAt)}</span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/admin/tickets/${ticket.id}`}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white transition ${
                          isUnread
                            ? 'bg-cyan-500 hover:bg-cyan-400'
                            : 'bg-cyan-600 hover:bg-cyan-500'
                        }`}
                      >
                        {isUnread ? 'Reply' : 'View'}
                        <svg
                          className="h-4 w-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
