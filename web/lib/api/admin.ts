// Admin API functions for ticket management
// Requires ADMIN_API_KEY header for authentication

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-d538.up.railway.app/api/v1';

interface AdminRequestOptions {
  apiKey: string;
}

interface TicketMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  content: string;
  isFromAI: boolean;
  createdAt: string;
}

export interface TicketUser {
  id: string;
  email: string;
  name: string | null;
}

export interface Ticket {
  id: string;
  userId: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  assignedAgentName: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  messages?: TicketMessage[];
  user?: TicketUser;
}

interface TicketsResponse {
  tickets: Ticket[];
}

interface TicketResponse {
  ticket: Ticket;
}

async function adminFetch<T>(
  endpoint: string,
  options: AdminRequestOptions & RequestInit
): Promise<T> {
  const { apiKey, ...fetchOptions } = options;

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-API-Key': apiKey,
      ...fetchOptions.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function getTickets(apiKey: string, status?: string): Promise<Ticket[]> {
  const endpoint = status ? `/admin/tickets?status=${status}` : '/admin/tickets';
  const response = await adminFetch<TicketsResponse>(endpoint, {
    apiKey,
    method: 'GET',
  });
  return response.tickets;
}

export async function getTicketById(apiKey: string, ticketId: string): Promise<Ticket> {
  const response = await adminFetch<TicketResponse>(`/admin/tickets/${ticketId}`, {
    apiKey,
    method: 'GET',
  });
  return response.ticket;
}

export async function replyToTicket(
  apiKey: string,
  ticketId: string,
  message: string
): Promise<void> {
  await adminFetch(`/admin/tickets/${ticketId}/reply`, {
    apiKey,
    method: 'POST',
    body: JSON.stringify({ message }),
  });
}

export async function updateTicketStatus(
  apiKey: string,
  ticketId: string,
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED'
): Promise<void> {
  await adminFetch(`/admin/tickets/${ticketId}/status`, {
    apiKey,
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}
