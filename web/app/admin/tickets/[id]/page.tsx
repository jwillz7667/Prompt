'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getTicketById, replyToTicket, updateTicketStatus, type Ticket } from '@/lib/api/admin';

const statusColors: Record<string, string> = {
  OPEN: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  IN_PROGRESS: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  WAITING_ON_USER: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  RESOLVED: 'bg-green-500/20 text-green-400 border-green-500/30',
  CLOSED: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const priorityColors: Record<string, string> = {
  URGENT: 'text-red-400 bg-red-500/10',
  HIGH: 'text-orange-400 bg-orange-500/10',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10',
  LOW: 'text-green-400 bg-green-500/10',
};

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.id as string;
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const fetchTicket = async () => {
    const apiKey = sessionStorage.getItem('adminApiKey');
    if (!apiKey) return;

    setLoading(true);
    setError('');

    try {
      const data = await getTicketById(apiKey, ticketId);
      setTicket(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch ticket');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTicket();
  }, [ticketId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ticket?.messages]);

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || sending) return;

    const apiKey = sessionStorage.getItem('adminApiKey');
    if (!apiKey) return;

    setSending(true);
    setError('');

    try {
      await replyToTicket(apiKey, ticketId, replyText.trim());
      setReplyText('');
      await fetchTicket(); // Refresh to get new message
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    const apiKey = sessionStorage.getItem('adminApiKey');
    if (!apiKey) return;

    setUpdatingStatus(true);
    setError('');

    try {
      await updateTicketStatus(
        apiKey,
        ticketId,
        newStatus as 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED'
      );
      await fetchTicket();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-cyan-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-bold text-white mb-2">Ticket not found</h2>
        <p className="text-gray-400 mb-4">{error || 'The ticket you\'re looking for doesn\'t exist.'}</p>
        <Link
          href="/admin/tickets"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg transition"
        >
          ← Back to Tickets
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link
            href="/admin/tickets"
            className="inline-flex items-center gap-1 text-gray-400 hover:text-white text-sm mb-3 transition"
          >
            ← Back to Tickets
          </Link>
          <h1 className="text-2xl font-bold text-white">{ticket.subject}</h1>
          <p className="text-gray-400 mt-1">
            #{ticket.id.slice(0, 8).toUpperCase()} · {ticket.category} · Created {formatDate(ticket.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 text-sm font-medium rounded-lg ${priorityColors[ticket.priority] || 'text-gray-400 bg-gray-500/10'}`}>
            {ticket.priority}
          </span>
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg border outline-none cursor-pointer ${statusColors[ticket.status] || statusColors.OPEN} ${updatingStatus ? 'opacity-50' : ''}`}
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
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
          <p className="text-red-400">{error}</p>
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 col-span-2">
          <p className="text-gray-400 text-sm mb-1">User</p>
          <p className="text-white font-medium">{ticket.user?.email || 'Unknown'}</p>
          {ticket.user?.name && (
            <p className="text-gray-400 text-sm mt-0.5">{ticket.user.name}</p>
          )}
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-gray-400 text-sm mb-1">Assigned Agent</p>
          <p className="text-white font-medium">{ticket.assignedAgentName || 'Unassigned'}</p>
        </div>
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <p className="text-gray-400 text-sm mb-1">Last Updated</p>
          <p className="text-white font-medium">{formatDate(ticket.updatedAt)}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700">
          <h2 className="font-semibold text-white">Conversation</h2>
        </div>

        <div className="p-4 space-y-4 max-h-[500px] overflow-y-auto">
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
                    ? 'bg-green-600/20 border border-green-500/30 text-white'
                    : 'bg-gray-700 text-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium ${
                    message.role === 'user'
                      ? 'text-cyan-200'
                      : message.role === 'agent'
                      ? 'text-green-400'
                      : 'text-gray-400'
                  }`}>
                    {message.role === 'user'
                      ? (ticket.user?.name || ticket.user?.email || 'User')
                      : message.role === 'agent'
                      ? ticket.assignedAgentName || 'Agent'
                      : 'Prompt Bot'}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatTime(message.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply Form */}
        {ticket.status !== 'CLOSED' && (
          <form onSubmit={handleSendReply} className="p-4 border-t border-gray-700">
            <div className="flex gap-3">
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Type your reply..."
                rows={3}
                className="flex-1 px-4 py-3 bg-gray-900 border border-gray-600 rounded-xl text-white placeholder-gray-500 focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none transition resize-none"
              />
              <button
                type="submit"
                disabled={!replyText.trim() || sending}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold rounded-xl transition self-end"
              >
                {sending ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                    Sending...
                  </span>
                ) : (
                  'Send Reply'
                )}
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Your reply will be sent to the user via email and appear in their app.
            </p>
          </form>
        )}

        {ticket.status === 'CLOSED' && (
          <div className="p-4 border-t border-gray-700 bg-gray-750">
            <p className="text-gray-400 text-center">This ticket is closed. Change status to reply.</p>
          </div>
        )}
      </div>
    </div>
  );
}
