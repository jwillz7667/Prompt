// The single consumer plan, matching the iOS product
// com.promptomizer.premium.monthly. Display copy only: the charged amount is
// whatever the Stripe price in STRIPE_PREMIUM_MONTHLY_PRICE_ID says, so keep
// the two in step when the price changes.
export const PREMIUM_PLAN = {
  id: 'premium_monthly',
  name: 'Promptomize Premium',
  priceUsd: 9.99,
  priceLabel: '$9.99',
  intervalLabel: 'month',
  trialDays: 3,
  features: [
    'Prompt optimizer for text, image, video, audio, code and 3D',
    'AI chat assistant',
    'MAX mode and Deep Think',
    'Sync your history with the Promptomize iOS app',
    'Export prompts to PDF, TXT and Markdown',
  ],
} as const

export const PREMIUM_TRIAL_SUMMARY = `${PREMIUM_PLAN.trialDays}-day free trial, then ${PREMIUM_PLAN.priceLabel}/${PREMIUM_PLAN.intervalLabel}, cancel anytime`

export function premiumRenewalTerms(includesTrial: boolean): string {
  const { priceLabel, intervalLabel, trialDays } = PREMIUM_PLAN
  const start = includesTrial
    ? `A card is required to start your ${trialDays}-day free trial. Unless you cancel before it ends, you'll be charged ${priceLabel} when it ends`
    : `You'll be charged ${priceLabel} today`
  return (
    `${start} and then ${priceLabel} every ${intervalLabel}. The subscription renews ` +
    `automatically until you cancel. Cancel anytime from Manage subscription; you keep ` +
    `access until the end of the period you've paid for.`
  )
}

export const APP_STORE_MANAGE_INSTRUCTIONS =
  'You subscribed through the App Store. Manage or cancel it on your iPhone or iPad in Settings > Apple Account > Subscriptions.'
