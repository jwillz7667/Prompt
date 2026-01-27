import { Resend } from 'resend';
import { logger } from '../utils/logger.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const resend = new Resend(process.env['RESEND_API_KEY']);

const FROM_EMAIL = process.env['FROM_EMAIL'] || 'Promptomize <hello@promptomize.app>';
const SUPPORT_EMAIL = process.env['SUPPORT_EMAIL'] || 'support@promptomize.app';
const APP_NAME = 'Promptomize';
const APP_URL = process.env['APP_URL'] || 'https://promptomize.app';

// ============================================================================
// TYPES
// ============================================================================

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

interface TicketMessage {
  role: string;
  content: string;
  createdAt: Date;
  isFromAI: boolean;
}

interface TicketDetails {
  id: string;
  subject: string;
  category: string;
  status: string;
  createdAt: Date;
  messages: TicketMessage[];
}

// ============================================================================
// BASE EMAIL SENDER
// ============================================================================

async function sendEmail(options: EmailOptions): Promise<boolean> {
  if (!process.env['RESEND_API_KEY']) {
    logger.warn('RESEND_API_KEY not configured, skipping email');
    return false;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html: options.html,
      replyTo: options.replyTo,
    });

    if (error) {
      logger.error({ error, to: options.to, subject: options.subject }, 'Failed to send email');
      return false;
    }

    logger.info({ emailId: data?.id, to: options.to, subject: options.subject }, 'Email sent successfully');
    return true;
  } catch (error) {
    logger.error({ error, to: options.to }, 'Email send error');
    return false;
  }
}

// ============================================================================
// EMAIL TEMPLATES - BASE LAYOUT
// ============================================================================

const LOGO_URL = process.env['LOGO_URL'] || `${APP_URL}/app-icon.png`;

function baseTemplate(content: string, preheader: string = ''): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${APP_NAME}</title>
  <style>
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f7; }
    .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
    .header { background: linear-gradient(135deg, #512AD4 0%, #7B5CD6 100%); padding: 32px; text-align: center; }
    .header-logo { width: 64px; height: 64px; border-radius: 14px; }
    .header h1 { color: #ffffff; font-size: 24px; font-weight: 600; margin: 16px 0 0 0; }
    .content { padding: 32px; color: #1d1d1f; line-height: 1.6; }
    .content h2 { color: #1d1d1f; font-size: 20px; font-weight: 600; margin: 0 0 16px 0; }
    .content p { margin: 0 0 16px 0; color: #424245; }
    .button { display: inline-block; background: #512AD4; color: #ffffff !important; text-decoration: none; padding: 14px 28px; border-radius: 8px; font-weight: 600; margin: 16px 0; }
    .button:hover { background: #4024B0; }
    .footer { background-color: #f5f5f7; padding: 24px 32px; text-align: center; color: #86868b; font-size: 12px; }
    .footer a { color: #512AD4; text-decoration: none; }
    .divider { height: 1px; background-color: #e5e5e7; margin: 24px 0; }
    .info-box { background-color: #f5f5f7; border-radius: 8px; padding: 16px; margin: 16px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e5e7; }
    .info-row:last-child { border-bottom: none; }
    .info-label { color: #86868b; font-size: 14px; }
    .info-value { color: #1d1d1f; font-size: 14px; font-weight: 500; }
    .message-bubble { padding: 12px 16px; border-radius: 12px; margin: 8px 0; max-width: 85%; }
    .message-user { background-color: #512AD4; color: #ffffff; margin-left: auto; text-align: right; }
    .message-assistant { background-color: #f5f5f7; color: #1d1d1f; }
    .message-agent { background-color: #e8f5e9; color: #1d1d1f; border-left: 3px solid #4caf50; }
    .message-meta { font-size: 11px; color: #86868b; margin-top: 4px; }
    .preheader { display: none; max-height: 0; overflow: hidden; }
  </style>
</head>
<body>
  <div class="preheader">${preheader}</div>
  <div class="container">
    <div class="header">
      <img src="${LOGO_URL}" alt="${APP_NAME}" class="header-logo" />
      <h1>${APP_NAME}</h1>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.</p>
      <p>
        <a href="${APP_URL}/privacy">Privacy Policy</a> &bull;
        <a href="${APP_URL}/terms">Terms of Service</a> &bull;
        <a href="mailto:${SUPPORT_EMAIL}">Contact Support</a>
      </p>
      <p style="margin-top: 16px; font-size: 11px;">
        You're receiving this email because you have an account with ${APP_NAME}.
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ============================================================================
// AUTHENTICATION EMAILS
// ============================================================================

export async function sendWelcomeEmail(to: string, name: string | null): Promise<boolean> {
  const displayName = name || 'there';
  const content = `
    <h2>Welcome to ${APP_NAME}!</h2>
    <p>Hi ${displayName},</p>
    <p>Thank you for joining ${APP_NAME}! We're excited to have you on board.</p>
    <p>${APP_NAME} uses advanced AI to transform your prompts into optimized, powerful versions that get better results from any AI assistant.</p>
    <div class="info-box">
      <p style="margin: 0; font-weight: 600;">Here's what you can do:</p>
      <ul style="margin: 12px 0 0 0; padding-left: 20px; color: #424245;">
        <li>Enhance any prompt with one tap</li>
        <li>Save your favorite prompts</li>
        <li>Use templates for common tasks</li>
        <li>Track your usage analytics</li>
      </ul>
    </div>
    <p style="text-align: center;">
      <a href="${APP_URL}" class="button">Open ${APP_NAME}</a>
    </p>
    <p>If you have any questions, our support team is always here to help.</p>
    <p>Happy prompting!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Welcome to ${APP_NAME}!`,
    html: baseTemplate(content, `Welcome to ${APP_NAME}! Start enhancing your prompts today.`),
  });
}

export async function sendEmailVerification(to: string, verificationUrl: string): Promise<boolean> {
  const content = `
    <h2>Verify Your Email Address</h2>
    <p>Thanks for signing up for ${APP_NAME}! Please verify your email address to complete your registration.</p>
    <p style="text-align: center;">
      <a href="${verificationUrl}" class="button">Verify Email Address</a>
    </p>
    <p style="color: #86868b; font-size: 14px;">This link will expire in 24 hours. If you didn't create an account with ${APP_NAME}, you can safely ignore this email.</p>
    <div class="divider"></div>
    <p style="color: #86868b; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${verificationUrl}" style="word-break: break-all;">${verificationUrl}</a></p>
  `;

  return sendEmail({
    to,
    subject: `Verify your ${APP_NAME} email`,
    html: baseTemplate(content, 'Please verify your email address to complete your registration.'),
  });
}

export async function sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
  const content = `
    <h2>Reset Your Password</h2>
    <p>We received a request to reset your password. Click the button below to create a new password.</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </p>
    <p style="color: #86868b; font-size: 14px;">This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.</p>
    <div class="divider"></div>
    <p style="color: #86868b; font-size: 12px;">If the button doesn't work, copy and paste this link into your browser:<br><a href="${resetUrl}" style="word-break: break-all;">${resetUrl}</a></p>
  `;

  return sendEmail({
    to,
    subject: `Reset your ${APP_NAME} password`,
    html: baseTemplate(content, 'Reset your password to regain access to your account.'),
  });
}

// ============================================================================
// SUBSCRIPTION EMAILS
// ============================================================================

export async function sendSubscriptionConfirmation(
  to: string,
  name: string | null,
  tier: string,
  expiresAt: Date | null
): Promise<boolean> {
  const displayName = name || 'there';
  const tierDisplay = tier.charAt(0) + tier.slice(1).toLowerCase();
  const expirationText = expiresAt
    ? `Your subscription renews on ${expiresAt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`
    : '';

  const features = tier === 'PREMIUM'
    ? ['Unlimited daily prompts', 'Up to 64,000 tokens per prompt', 'Advanced prompt quality', 'Priority support', 'Deep Think mode']
    : ['100 daily prompts', 'Up to 8,000 tokens per prompt', 'Standard prompt quality', 'Email support'];

  const content = `
    <h2>Welcome to ${APP_NAME} ${tierDisplay}!</h2>
    <p>Hi ${displayName},</p>
    <p>Thank you for subscribing to ${APP_NAME} ${tierDisplay}! Your subscription is now active.</p>
    <div class="info-box">
      <p style="margin: 0 0 12px 0; font-weight: 600;">Your ${tierDisplay} benefits:</p>
      <ul style="margin: 0; padding-left: 20px; color: #424245;">
        ${features.map(f => `<li>${f}</li>`).join('')}
      </ul>
    </div>
    <p>${expirationText}</p>
    <p style="text-align: center;">
      <a href="${APP_URL}" class="button">Start Using ${tierDisplay} Features</a>
    </p>
    <p>Thank you for your support!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Welcome to ${APP_NAME} ${tierDisplay}!`,
    html: baseTemplate(content, `Your ${APP_NAME} ${tierDisplay} subscription is now active.`),
  });
}

export async function sendSubscriptionRenewalReminder(
  to: string,
  name: string | null,
  tier: string,
  renewalDate: Date
): Promise<boolean> {
  const displayName = name || 'there';
  const tierDisplay = tier.charAt(0) + tier.slice(1).toLowerCase();
  const dateStr = renewalDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const content = `
    <h2>Subscription Renewal Reminder</h2>
    <p>Hi ${displayName},</p>
    <p>This is a friendly reminder that your ${APP_NAME} ${tierDisplay} subscription will automatically renew on <strong>${dateStr}</strong>.</p>
    <div class="info-box">
      <p style="margin: 0;">No action is needed if you'd like to continue enjoying ${tierDisplay} benefits. Your payment method on file will be charged automatically.</p>
    </div>
    <p>If you'd like to manage your subscription or update your payment method, you can do so in the app settings.</p>
    <p style="text-align: center;">
      <a href="${APP_URL}/settings" class="button">Manage Subscription</a>
    </p>
    <p>Thank you for being a ${APP_NAME} subscriber!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Your ${APP_NAME} subscription renews on ${dateStr}`,
    html: baseTemplate(content, `Your subscription renews on ${dateStr}.`),
  });
}

export async function sendSubscriptionCancelled(
  to: string,
  name: string | null,
  tier: string,
  accessUntil: Date
): Promise<boolean> {
  const displayName = name || 'there';
  const tierDisplay = tier.charAt(0) + tier.slice(1).toLowerCase();
  const dateStr = accessUntil.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const content = `
    <h2>Subscription Cancelled</h2>
    <p>Hi ${displayName},</p>
    <p>We're sorry to see you go! Your ${APP_NAME} ${tierDisplay} subscription has been cancelled.</p>
    <div class="info-box">
      <p style="margin: 0;">You'll continue to have access to ${tierDisplay} features until <strong>${dateStr}</strong>. After that, your account will revert to the Free plan.</p>
    </div>
    <p>If you change your mind, you can resubscribe at any time to regain access to premium features.</p>
    <p>We'd love to hear your feedback on how we can improve. Feel free to reply to this email or contact our support team.</p>
    <p style="text-align: center;">
      <a href="${APP_URL}/upgrade" class="button">Resubscribe</a>
    </p>
    <p>Thank you for trying ${APP_NAME}!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Your ${APP_NAME} subscription has been cancelled`,
    html: baseTemplate(content, `Your subscription has been cancelled. Access continues until ${dateStr}.`),
    replyTo: SUPPORT_EMAIL,
  });
}

export async function sendSubscriptionExpired(
  to: string,
  name: string | null,
  tier: string
): Promise<boolean> {
  const displayName = name || 'there';
  const tierDisplay = tier.charAt(0) + tier.slice(1).toLowerCase();

  const content = `
    <h2>Subscription Expired</h2>
    <p>Hi ${displayName},</p>
    <p>Your ${APP_NAME} ${tierDisplay} subscription has expired. Your account has been moved to the Free plan.</p>
    <div class="info-box">
      <p style="margin: 0 0 12px 0; font-weight: 600;">With the Free plan, you still get:</p>
      <ul style="margin: 0; padding-left: 20px; color: #424245;">
        <li>10 prompts per day</li>
        <li>Basic prompt enhancement</li>
        <li>Prompt history</li>
      </ul>
    </div>
    <p>Ready to unlock unlimited prompts and premium features again?</p>
    <p style="text-align: center;">
      <a href="${APP_URL}/upgrade" class="button">Resubscribe to ${tierDisplay}</a>
    </p>
    <p>Thank you for being part of the ${APP_NAME} community!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Your ${APP_NAME} subscription has expired`,
    html: baseTemplate(content, `Your subscription has expired. Resubscribe to unlock premium features.`),
  });
}

// ============================================================================
// SUPPORT TICKET EMAILS
// ============================================================================

export async function sendTicketCreated(
  to: string,
  name: string | null,
  ticket: TicketDetails
): Promise<boolean> {
  const displayName = name || 'there';
  const ticketId = ticket.id.slice(0, 8).toUpperCase();
  const dateStr = ticket.createdAt.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  });

  const messagesHtml = ticket.messages.map(msg => {
    const roleClass = msg.role === 'user' ? 'message-user' :
                      msg.role === 'agent' ? 'message-agent' : 'message-assistant';
    const roleLabel = msg.role === 'user' ? 'You' :
                      msg.role === 'agent' ? 'Support Agent' : 'AI Assistant';
    return `
      <div class="message-bubble ${roleClass}">
        <div>${msg.content.replace(/\n/g, '<br>')}</div>
        <div class="message-meta">${roleLabel}</div>
      </div>
    `;
  }).join('');

  const content = `
    <h2>Support Ticket Created</h2>
    <p>Hi ${displayName},</p>
    <p>We've received your support request and created a ticket. Our team will review it and get back to you as soon as possible.</p>
    <div class="info-box">
      <div style="display: table; width: 100%;">
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b;">Ticket ID</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; font-weight: 600;">#${ticketId}</div>
        </div>
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b; border-top: 1px solid #e5e5e7;">Category</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; border-top: 1px solid #e5e5e7;">${ticket.category}</div>
        </div>
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b; border-top: 1px solid #e5e5e7;">Created</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; border-top: 1px solid #e5e5e7;">${dateStr}</div>
        </div>
      </div>
    </div>
    <h3 style="font-size: 16px; margin: 24px 0 12px 0;">${ticket.subject}</h3>
    <div style="background: #fafafa; border-radius: 12px; padding: 16px;">
      ${messagesHtml}
    </div>
    <p style="margin-top: 24px;">You can reply to this email or continue the conversation in the app. We typically respond within 24 hours.</p>
    <p style="text-align: center;">
      <a href="${APP_URL}" class="button">View in App</a>
    </p>
    <p>Thank you for reaching out!<br>The ${APP_NAME} Support Team</p>
  `;

  return sendEmail({
    to,
    subject: `[Ticket #${ticketId}] ${ticket.subject}`,
    html: baseTemplate(content, `We've received your support request. Ticket #${ticketId}`),
    replyTo: SUPPORT_EMAIL,
  });
}

export async function sendTicketResponse(
  to: string,
  name: string | null,
  ticket: TicketDetails,
  newMessage: string
): Promise<boolean> {
  const displayName = name || 'there';
  const ticketId = ticket.id.slice(0, 8).toUpperCase();

  const messagesHtml = ticket.messages.map(msg => {
    const roleClass = msg.role === 'user' ? 'message-user' :
                      msg.role === 'agent' ? 'message-agent' : 'message-assistant';
    const roleLabel = msg.role === 'user' ? 'You' :
                      msg.role === 'agent' ? 'Support Agent' : 'AI Assistant';
    const timeStr = msg.createdAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    return `
      <div class="message-bubble ${roleClass}">
        <div>${msg.content.replace(/\n/g, '<br>')}</div>
        <div class="message-meta">${roleLabel} &bull; ${timeStr}</div>
      </div>
    `;
  }).join('');

  const content = `
    <h2>New Response on Your Ticket</h2>
    <p>Hi ${displayName},</p>
    <p>A support agent has responded to your ticket.</p>
    <div class="info-box">
      <div style="display: table; width: 100%;">
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b;">Ticket ID</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; font-weight: 600;">#${ticketId}</div>
        </div>
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b; border-top: 1px solid #e5e5e7;">Status</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; border-top: 1px solid #e5e5e7;">${ticket.status}</div>
        </div>
      </div>
    </div>
    <h3 style="font-size: 16px; margin: 24px 0 12px 0;">${ticket.subject}</h3>
    <div style="background: #e8f5e9; border-radius: 12px; padding: 16px; border-left: 4px solid #4caf50;">
      <p style="margin: 0; font-weight: 600; color: #2e7d32; font-size: 14px;">New Response from Support:</p>
      <p style="margin: 12px 0 0 0;">${newMessage.replace(/\n/g, '<br>')}</p>
    </div>
    <div class="divider"></div>
    <h4 style="font-size: 14px; color: #86868b; margin: 0 0 12px 0;">Full Conversation</h4>
    <div style="background: #fafafa; border-radius: 12px; padding: 16px;">
      ${messagesHtml}
    </div>
    <p style="margin-top: 24px;">You can reply to this email or continue the conversation in the app.</p>
    <p style="text-align: center;">
      <a href="${APP_URL}" class="button">Reply in App</a>
    </p>
    <p>Best regards,<br>The ${APP_NAME} Support Team</p>
  `;

  return sendEmail({
    to,
    subject: `Re: [Ticket #${ticketId}] ${ticket.subject}`,
    html: baseTemplate(content, `A support agent has responded to your ticket #${ticketId}`),
    replyTo: SUPPORT_EMAIL,
  });
}

export async function sendTicketResolved(
  to: string,
  name: string | null,
  ticket: TicketDetails
): Promise<boolean> {
  const displayName = name || 'there';
  const ticketId = ticket.id.slice(0, 8).toUpperCase();

  const messagesHtml = ticket.messages.map(msg => {
    const roleClass = msg.role === 'user' ? 'message-user' :
                      msg.role === 'agent' ? 'message-agent' : 'message-assistant';
    const roleLabel = msg.role === 'user' ? 'You' :
                      msg.role === 'agent' ? 'Support Agent' : 'AI Assistant';
    return `
      <div class="message-bubble ${roleClass}">
        <div>${msg.content.replace(/\n/g, '<br>')}</div>
        <div class="message-meta">${roleLabel}</div>
      </div>
    `;
  }).join('');

  const content = `
    <h2>Ticket Resolved</h2>
    <p>Hi ${displayName},</p>
    <p>Your support ticket has been marked as resolved. We hope we were able to help!</p>
    <div class="info-box">
      <div style="display: table; width: 100%;">
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b;">Ticket ID</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; font-weight: 600;">#${ticketId}</div>
        </div>
        <div style="display: table-row;">
          <div style="display: table-cell; padding: 8px 0; color: #86868b; border-top: 1px solid #e5e5e7;">Status</div>
          <div style="display: table-cell; padding: 8px 0; text-align: right; color: #4caf50; font-weight: 600; border-top: 1px solid #e5e5e7;">Resolved</div>
        </div>
      </div>
    </div>
    <h3 style="font-size: 16px; margin: 24px 0 12px 0;">${ticket.subject}</h3>
    <details style="background: #fafafa; border-radius: 12px; padding: 16px;">
      <summary style="cursor: pointer; font-weight: 600; color: #512AD4;">View Full Conversation</summary>
      <div style="margin-top: 12px;">
        ${messagesHtml}
      </div>
    </details>
    <p style="margin-top: 24px;">If you need further assistance, feel free to open a new ticket or reply to this email.</p>
    <p>Thank you for using ${APP_NAME}!<br>The ${APP_NAME} Support Team</p>
  `;

  return sendEmail({
    to,
    subject: `[Resolved] Ticket #${ticketId}: ${ticket.subject}`,
    html: baseTemplate(content, `Your support ticket #${ticketId} has been resolved.`),
    replyTo: SUPPORT_EMAIL,
  });
}

// ============================================================================
// USAGE & NOTIFICATION EMAILS
// ============================================================================

export async function sendDailyLimitReached(
  to: string,
  name: string | null,
  tier: string,
  limit: number
): Promise<boolean> {
  const displayName = name || 'there';

  const content = `
    <h2>Daily Prompt Limit Reached</h2>
    <p>Hi ${displayName},</p>
    <p>You've used all ${limit} of your daily prompts. Your limit will reset at midnight UTC.</p>
    ${tier === 'FREE' ? `
    <div class="info-box">
      <p style="margin: 0; font-weight: 600;">Want more prompts?</p>
      <p style="margin: 8px 0 0 0;">Upgrade to Pro for 100 daily prompts, or Premium for unlimited prompts!</p>
    </div>
    <p style="text-align: center;">
      <a href="${APP_URL}/upgrade" class="button">Upgrade Now</a>
    </p>
    ` : ''}
    <p>Keep creating amazing prompts!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `You've reached your daily prompt limit`,
    html: baseTemplate(content, `You've used all ${limit} daily prompts. Resets at midnight UTC.`),
  });
}

export async function sendAccountDeleted(to: string, name: string | null): Promise<boolean> {
  const displayName = name || 'there';

  const content = `
    <h2>Account Deleted</h2>
    <p>Hi ${displayName},</p>
    <p>Your ${APP_NAME} account has been successfully deleted as requested.</p>
    <div class="info-box">
      <p style="margin: 0;">All your data, including prompts, templates, and subscription information, has been permanently removed from our systems.</p>
    </div>
    <p>We're sorry to see you go. If you ever want to come back, you're always welcome to create a new account.</p>
    <p>If you didn't request this deletion, please contact us immediately at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>
    <p>Thank you for trying ${APP_NAME}!<br>The ${APP_NAME} Team</p>
  `;

  return sendEmail({
    to,
    subject: `Your ${APP_NAME} account has been deleted`,
    html: baseTemplate(content, 'Your account and all data have been permanently deleted.'),
    replyTo: SUPPORT_EMAIL,
  });
}
