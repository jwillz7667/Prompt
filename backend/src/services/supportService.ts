import { prisma } from '../utils/prisma.js';
import { logger } from '../utils/logger.js';
import type { TicketCategory, TicketPriority, TicketStatus } from '@prisma/client';
import { sendTicketCreated, sendTicketNotificationToSupport, sendTicketResponse } from './emailService.js';
import { emitNewMessage } from '../utils/socket.js';
import { sendSupportMessageNotification } from './notificationService.js';

// ============================================================================
// TYPES
// ============================================================================

export interface SupportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  userId: string;
  ticketId?: string;
  message: string;
  conversationHistory?: SupportMessage[];
}

export interface ChatResponse {
  reply: string;
  ticketCreated: boolean;
  ticketId?: string;
  category?: TicketCategory;
  agentHandling?: boolean; // True when a human agent has taken over
}

export interface Ticket {
  id: string;
  userId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  summary: string | null;
  assignedAgentName: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface TicketWithMessages extends Ticket {
  messages: Array<{
    id: string;
    role: string;
    content: string;
    isFromAI: boolean;
    createdAt: Date;
  }>;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const SUPPORT_MODEL = 'deepseek-chat';
const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3; // Lower temperature for more consistent support responses

// Support agent names - one will be randomly assigned per ticket for consistency
const SUPPORT_AGENT_NAMES = [
  'Priya',
  'Carlos',
  'Yuki',
  'Amara',
  'Liam',
  'Fatima',
  'Kofi',
  'Sofia',
  'Jin',
  'Anya',
  'Omar',
  'Elena',
  'Kenji',
  'Zara',
  'Diego',
];

function getRandomAgentName(): string {
  return SUPPORT_AGENT_NAMES[Math.floor(Math.random() * SUPPORT_AGENT_NAMES.length)] as string;
}

// ============================================================================
// CONSTRAINED SYSTEM PROMPT
// This prompt is intentionally restrictive to prevent the AI from accessing
// or discussing any sensitive user data, account details, or system information.
// ============================================================================

const SUPPORT_SYSTEM_PROMPT = `You are a friendly and helpful customer support assistant for Promptomize, a prompt enhancement app.

STRICT LIMITATIONS - You MUST follow these rules:
1. You can ONLY help with these topics:
   - General questions about how the app works
   - Explaining subscription tiers (FREE, PRO, PREMIUM)
   - Troubleshooting common issues (login problems, app crashes, sync issues)
   - Explaining features (prompt enhancement, history, contexts, collections, workflows)
   - Creating support tickets for issues that need human review
   - Billing and payment questions (general explanations only)

2. You CANNOT and MUST NOT:
   - Access, view, or discuss any user's personal data
   - Access, view, or discuss any user's prompts, history, or content
   - Access, view, or discuss any user's payment information or transaction details
   - Make changes to any account settings
   - Process refunds or modify subscriptions
   - Access any backend systems or databases
   - Provide specific account information (like usage counts, exact subscription dates)
   - Debug code or provide technical development assistance

3. When you cannot help with something, you MUST:
   - Politely explain that you'll create a support ticket for human review
   - Ask the user to describe their issue clearly
   - Respond with a message containing [CREATE_TICKET:CATEGORY] where CATEGORY is one of: ACCOUNT, BILLING, TECHNICAL, FEATURE_REQUEST, BUG_REPORT, OTHER

4. Response style:
   - Be concise and helpful (2-4 sentences for simple questions)
   - Be empathetic and professional
   - Never make up information - if unsure, create a ticket
   - Don't use excessive punctuation or emojis

TICKET CREATION:
When you determine a ticket should be created, include EXACTLY this format at the END of your response:
[CREATE_TICKET:CATEGORY]

Categories:
- ACCOUNT: Login issues, account access, profile problems
- BILLING: Payment issues, subscription questions, refunds
- TECHNICAL: App bugs, crashes, performance issues
- FEATURE_REQUEST: Suggestions for new features
- BUG_REPORT: Reporting bugs with details
- OTHER: Anything else

Example responses:
- User asks "How does the PRO subscription work?": Explain the features, no ticket needed
- User asks "I was charged twice": Apologize, explain you'll create a ticket for the billing team, then add [CREATE_TICKET:BILLING]
- User asks "Can you show me my prompts?": Explain you don't have access to their data and offer to help with general questions

Remember: You are a helpful assistant but with LIMITED capabilities. When in doubt, create a ticket.`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseTicketCategory(response: string): TicketCategory | null {
  const match = response.match(/\[CREATE_TICKET:(\w+)\]/);
  if (!match || !match[1]) return null;

  const category = match[1].toUpperCase();
  const validCategories: TicketCategory[] = ['ACCOUNT', 'BILLING', 'TECHNICAL', 'FEATURE_REQUEST', 'BUG_REPORT', 'OTHER'];

  return validCategories.includes(category as TicketCategory)
    ? (category as TicketCategory)
    : 'OTHER';
}

function cleanResponse(response: string): string {
  // Remove the ticket creation marker from the visible response
  return response.replace(/\[CREATE_TICKET:\w+\]/g, '').trim();
}

function determinePriority(category: TicketCategory): TicketPriority {
  switch (category) {
    case 'BILLING':
      return 'HIGH';
    case 'ACCOUNT':
      return 'HIGH';
    case 'TECHNICAL':
      return 'MEDIUM';
    case 'BUG_REPORT':
      return 'MEDIUM';
    case 'FEATURE_REQUEST':
      return 'LOW';
    case 'OTHER':
    default:
      return 'MEDIUM';
  }
}

function generateTicketSubject(userMessage: string, category: TicketCategory): string {
  // Create a concise subject from the user's message
  const truncated = userMessage.slice(0, 100);
  const categoryPrefix = {
    ACCOUNT: 'Account Issue',
    BILLING: 'Billing Inquiry',
    TECHNICAL: 'Technical Issue',
    FEATURE_REQUEST: 'Feature Request',
    BUG_REPORT: 'Bug Report',
    OTHER: 'Support Request',
  };

  return `${categoryPrefix[category]}: ${truncated}${userMessage.length > 100 ? '...' : ''}`;
}

// ============================================================================
// MAIN SERVICE FUNCTIONS
// ============================================================================

export async function chatWithSupport(request: ChatRequest): Promise<ChatResponse> {
  const apiKey = process.env['DEEPSEEK_API_KEY'];
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable not configured');
  }

  // Build conversation messages
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: SUPPORT_SYSTEM_PROMPT },
  ];

  // Add conversation history if provided
  if (request.conversationHistory) {
    for (const msg of request.conversationHistory) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  // Add the current message
  messages.push({ role: 'user', content: request.message });

  try {
    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: SUPPORT_MODEL,
        messages,
        temperature: TEMPERATURE,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error({ status: response.status, body: errorBody }, 'DeepSeek Support API error');
      throw new Error(`Support AI error: ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const rawReply = data.choices[0]?.message?.content || '';
    const category = parseTicketCategory(rawReply);
    const cleanedReply = cleanResponse(rawReply);

    // If AI indicated a ticket should be created
    if (category) {
      const ticket = await createTicket({
        userId: request.userId,
        subject: generateTicketSubject(request.message, category),
        category,
        priority: determinePriority(category),
        initialMessage: request.message,
        aiSummary: cleanedReply,
        conversationHistory: request.conversationHistory,
      });

      return {
        reply: cleanedReply,
        ticketCreated: true,
        ticketId: ticket.id,
        category,
      };
    }

    return {
      reply: cleanedReply,
      ticketCreated: false,
    };
  } catch (error) {
    logger.error({ error }, 'Support chat error');
    throw error;
  }
}

interface CreateTicketParams {
  userId: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  initialMessage: string;
  aiSummary?: string;
  conversationHistory?: SupportMessage[];
}

export async function createTicket(params: CreateTicketParams): Promise<Ticket> {
  const { userId, subject, category, priority, initialMessage, aiSummary, conversationHistory } = params;

  // Create ticket with messages in a transaction
  const ticket = await prisma.$transaction(async (tx) => {
    // Create the ticket with an assigned agent name
    const newTicket = await tx.supportTicket.create({
      data: {
        userId,
        subject,
        category,
        priority,
        status: 'OPEN',
        summary: aiSummary,
        assignedAgentName: getRandomAgentName(),
      },
    });

    // Add conversation history as messages if provided
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        await tx.supportMessage.create({
          data: {
            ticketId: newTicket.id,
            role: msg.role,
            content: msg.content,
            isFromAI: msg.role === 'assistant',
          },
        });
      }
    }

    // Add the initial message that triggered ticket creation
    await tx.supportMessage.create({
      data: {
        ticketId: newTicket.id,
        role: 'user',
        content: initialMessage,
        isFromAI: false,
      },
    });

    // Add AI's response as a message
    if (aiSummary) {
      await tx.supportMessage.create({
        data: {
          ticketId: newTicket.id,
          role: 'assistant',
          content: aiSummary,
          isFromAI: true,
        },
      });
    }

    return newTicket;
  });

  logger.info({ ticketId: ticket.id, userId, category }, 'Support ticket created');

  // Send ticket created email (fire-and-forget)
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true },
  });

  if (user) {
    // Build messages array for email
    const messages: Array<{ role: string; content: string; createdAt: Date; isFromAI: boolean }> = [];

    if (conversationHistory) {
      for (const msg of conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content,
          createdAt: ticket.createdAt,
          isFromAI: msg.role === 'assistant',
        });
      }
    }

    messages.push({
      role: 'user',
      content: initialMessage,
      createdAt: ticket.createdAt,
      isFromAI: false,
    });

    if (aiSummary) {
      messages.push({
        role: 'assistant',
        content: aiSummary,
        createdAt: ticket.createdAt,
        isFromAI: true,
      });
    }

    const ticketDetails = {
      id: ticket.id,
      subject: ticket.subject,
      category: ticket.category,
      priority: ticket.priority,
      status: ticket.status,
      createdAt: ticket.createdAt,
      messages,
    };

    // Send confirmation email to user
    sendTicketCreated(user.email, user.name, ticketDetails).catch((err) => {
      logger.warn({ error: err, ticketId: ticket.id }, 'Failed to send ticket created email to user');
    });

    // Send notification email to support team
    sendTicketNotificationToSupport(user.email, user.name, ticketDetails).catch((err) => {
      logger.warn({ error: err, ticketId: ticket.id }, 'Failed to send ticket notification to support');
    });
  }

  return ticket;
}

export async function getTicket(ticketId: string, userId: string): Promise<TicketWithMessages | null> {
  const ticket = await prisma.supportTicket.findFirst({
    where: {
      id: ticketId,
      userId, // Ensure user can only access their own tickets
    },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  return ticket;
}

export async function getUserTickets(userId: string): Promise<Ticket[]> {
  const tickets = await prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  return tickets;
}

export async function addMessageToTicket(
  ticketId: string,
  userId: string,
  content: string,
  role: 'user' | 'assistant' | 'agent',
  isFromAI: boolean = false
): Promise<void> {
  // Verify ticket belongs to user (skip for agent messages)
  if (role !== 'agent') {
    const ticket = await prisma.supportTicket.findFirst({
      where: { id: ticketId, userId },
    });

    if (!ticket) {
      throw new Error('Ticket not found');
    }

    if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
      throw new Error('Cannot add messages to closed tickets');
    }
  }

  const [newMessage] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        role,
        content,
        isFromAI,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: role === 'user' ? 'OPEN' : undefined,
        updatedAt: new Date(),
      },
    }),
  ]);

  // Emit real-time update via WebSocket
  emitNewMessage({
    ticketId,
    message: {
      id: newMessage.id,
      role: newMessage.role as 'user' | 'assistant' | 'agent',
      content: newMessage.content,
      createdAt: newMessage.createdAt.toISOString(),
      isFromAI: newMessage.isFromAI,
    },
  });
}

// Agent reply to a ticket - sends email notification to user
export async function addAgentReplyToTicket(
  ticketId: string,
  agentMessage: string
): Promise<void> {
  // Get ticket with user info
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!ticket) {
    throw new Error('Ticket not found');
  }

  if (ticket.status === 'CLOSED') {
    throw new Error('Cannot reply to closed tickets');
  }

  // Get user info
  const user = await prisma.user.findUnique({
    where: { id: ticket.userId },
    select: { email: true, name: true },
  });

  if (!user) {
    throw new Error('User not found');
  }

  // Add agent message to ticket
  const [newMessage] = await prisma.$transaction([
    prisma.supportMessage.create({
      data: {
        ticketId,
        role: 'agent',
        content: agentMessage,
        isFromAI: false,
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        status: 'IN_PROGRESS',
        updatedAt: new Date(),
      },
    }),
  ]);

  // Emit real-time update via WebSocket
  emitNewMessage({
    ticketId,
    message: {
      id: newMessage.id,
      role: 'agent',
      content: newMessage.content,
      createdAt: newMessage.createdAt.toISOString(),
      isFromAI: false,
    },
  });

  // Get updated ticket with all messages for email
  const updatedTicket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (updatedTicket) {
    const ticketDetails = {
      id: updatedTicket.id,
      subject: updatedTicket.subject,
      category: updatedTicket.category,
      priority: updatedTicket.priority,
      status: updatedTicket.status,
      createdAt: updatedTicket.createdAt,
      messages: updatedTicket.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        isFromAI: msg.isFromAI,
      })),
    };

    // Send email notification to user
    sendTicketResponse(user.email, user.name, ticketDetails, agentMessage).catch((err) => {
      logger.warn({ error: err, ticketId }, 'Failed to send agent reply email to user');
    });

    // Send push notification to user
    sendSupportMessageNotification(
      ticket.userId,
      ticketId,
      ticket.assignedAgentName || 'Support Agent',
      agentMessage
    ).catch((err) => {
      logger.warn({ error: err, ticketId }, 'Failed to send push notification to user');
    });
  }

  logger.info({ ticketId, messageLength: agentMessage.length }, 'Agent reply added to ticket');
}

// Ticket with user info for admin
export interface TicketWithUser extends Ticket {
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

export interface TicketWithMessagesAndUser extends TicketWithMessages {
  user?: {
    id: string;
    email: string;
    name: string | null;
  };
}

// Get all tickets (for admin)
export async function getAllTickets(status?: string): Promise<TicketWithUser[]> {
  const whereClause = status ? { status: status as any } : {};

  const tickets = await prisma.supportTicket.findMany({
    where: whereClause,
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
    orderBy: [
      { priority: 'desc' },
      { createdAt: 'desc' },
    ],
  });

  return tickets as TicketWithUser[];
}

// Get ticket by ID (for admin - no user restriction)
export async function getTicketById(ticketId: string): Promise<TicketWithMessagesAndUser | null> {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
      },
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });

  return ticket as TicketWithMessagesAndUser | null;
}

// Update ticket status
export async function updateTicketStatus(
  ticketId: string,
  status: 'OPEN' | 'IN_PROGRESS' | 'WAITING_ON_USER' | 'RESOLVED' | 'CLOSED'
): Promise<void> {
  await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      status,
      updatedAt: new Date(),
      resolvedAt: status === 'RESOLVED' || status === 'CLOSED' ? new Date() : undefined,
    },
  });

  logger.info({ ticketId, status }, 'Ticket status updated');
}

export async function continueTicketChat(
  ticketId: string,
  userId: string,
  message: string
): Promise<ChatResponse> {
  // Get ticket with messages
  const ticket = await getTicket(ticketId, userId);
  if (!ticket) {
    throw new Error('Ticket not found');
  }

  if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
    throw new Error('This ticket has been closed');
  }

  // Check if a human agent has replied to this ticket
  const hasAgentReplied = ticket.messages.some((msg) => msg.role === 'agent');

  if (hasAgentReplied) {
    // Human agent has taken over - just save the user message, no AI response
    await addMessageToTicket(ticketId, userId, message, 'user', false);

    // Update ticket status to indicate user replied
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'OPEN', updatedAt: new Date() },
    });

    return {
      reply: '', // No AI reply when agent is handling
      ticketCreated: false,
      ticketId,
      agentHandling: true, // Flag to indicate agent is handling
    };
  }

  // No agent has replied yet - continue with AI bot
  // Build conversation history from ticket messages
  const conversationHistory: SupportMessage[] = ticket.messages
    .filter((msg) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    }));

  // Get AI response
  const response = await chatWithSupport({
    userId,
    ticketId,
    message,
    conversationHistory,
  });

  // Add user message and AI response to ticket
  await addMessageToTicket(ticketId, userId, message, 'user', false);
  await addMessageToTicket(ticketId, userId, response.reply, 'assistant', true);

  return response;
}
