import type Stripe from 'stripe';

/** Read current payloads and events created before Stripe's Basil migration. */
export function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | undefined {
  const legacy = invoice as unknown as { subscription?: string | { id: string } | null };
  const reference = invoice.parent?.subscription_details?.subscription ?? legacy.subscription;
  return typeof reference === 'string' ? reference : reference?.id;
}

export function getSubscriptionPeriod(subscription: Stripe.Subscription): {
  start: Date;
  end: Date;
} {
  const legacy = subscription as unknown as {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = subscription.items.data[0];
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  if (!start || !end || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new Error('Stripe subscription is missing a valid billing period');
  }
  return { start: new Date(start * 1000), end: new Date(end * 1000) };
}
