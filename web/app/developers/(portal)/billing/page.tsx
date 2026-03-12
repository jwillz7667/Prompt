'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  useApiSubscriptionStatus,
  useApiPlans,
  useApiCreditPacks,
  useApiBilling,
  useApiInvoices,
  useCreateApiCheckout,
  useCreateApiCreditCheckout,
  useCreateApiPortalSession,
  useCancelApiSubscription,
} from '@/lib/hooks/useApiKeys'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from '@/lib/stores/uiStore'
import { cn } from '@/lib/utils/cn'

export default function BillingPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const { data: subscription, isLoading: subLoading } = useApiSubscriptionStatus()
  const { data: plans } = useApiPlans()
  const { data: creditPacks } = useApiCreditPacks()
  const { data: billing } = useApiBilling()
  const { data: invoices } = useApiInvoices(5)
  const checkoutMutation = useCreateApiCheckout()
  const creditCheckoutMutation = useCreateApiCreditCheckout()
  const portalMutation = useCreateApiPortalSession()
  const cancelMutation = useCancelApiSubscription()

  const [cancelConfirm, setCancelConfirm] = useState(false)

  const currentTier = subscription?.tier || 'API_FREE'
  const isFreeTier = currentTier === 'API_FREE'
  const hasBillingAccount = Boolean(subscription?.hasBillingAccount)

  useEffect(() => {
    const checkout = searchParams.get('checkout')

    if (!checkout) {
      return
    }

    if (checkout === 'plan-success') {
      toast.success('Billing updated', 'Your API plan checkout completed successfully.')
    } else if (checkout === 'credits-success') {
      toast.success('Credits added', 'Your API credits were added to your account.')
    } else if (checkout === 'canceled') {
      toast.info('Checkout canceled', 'No billing changes were made.')
    }

    router.replace('/developers/billing')
  }, [router, searchParams])

  const handleUpgrade = async (tier: 'API_STARTER' | 'API_PRO') => {
    try {
      const successUrl = `${window.location.origin}/developers/billing?checkout=plan-success`
      const cancelUrl = `${window.location.origin}/developers/billing?checkout=canceled`
      const result = await checkoutMutation.mutateAsync({ tier, successUrl, cancelUrl })
      window.location.href = result.url
    } catch (error) {
      toast.error('Failed to start checkout', (error as Error).message)
    }
  }

  const handleBuyCredits = async (packId: 'BOOST_5K' | 'GROWTH_25K' | 'SCALE_100K') => {
    try {
      const successUrl = `${window.location.origin}/developers/billing?checkout=credits-success`
      const cancelUrl = `${window.location.origin}/developers/billing?checkout=canceled`
      const result = await creditCheckoutMutation.mutateAsync({ packId, successUrl, cancelUrl })
      window.location.href = result.url
    } catch (error) {
      toast.error('Failed to start credit checkout', (error as Error).message)
    }
  }

  const handleManageBilling = async () => {
    try {
      const returnUrl = `${window.location.origin}/developers/billing`
      const result = await portalMutation.mutateAsync(returnUrl)
      window.location.href = result.url
    } catch (error) {
      toast.error('Failed to open billing portal', (error as Error).message)
    }
  }

  const handleCancel = async () => {
    try {
      await cancelMutation.mutateAsync()
      setCancelConfirm(false)
      toast.success('Subscription canceled', 'Your plan will be downgraded at the end of the billing period.')
    } catch (error) {
      toast.error('Failed to cancel subscription', (error as Error).message)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-primary">Billing</h2>
        <p className="text-sm text-muted">Manage your API subscription and billing.</p>
      </div>

      {/* Current Plan */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm text-muted">Current Plan</div>
              <div className="text-2xl font-bold text-primary mt-1">
                {subLoading ? '...' : currentTier.replace('API_', '')}
              </div>
              <div className="text-sm text-muted mt-1">
                {subscription?.features?.slice(0, 2).join(' • ')}
              </div>
            </div>
            {!isFreeTier && (
              <div className="text-right">
                <div className="text-sm text-muted">Status</div>
                <div
                  className={cn(
                    'font-medium mt-1',
                    subscription?.status === 'ACTIVE' ? 'text-green-600' : 'text-yellow-600'
                  )}
                >
                  {subscription?.status}
                </div>
                {subscription?.period?.end && (
                  <div className="text-xs text-muted mt-1">
                    Renews {new Date(subscription.period.end).toLocaleDateString()}
                  </div>
                )}
              </div>
            )}
          </div>

          {(hasBillingAccount || !isFreeTier) && (
            <div className="flex gap-3 mt-6">
              <Button variant="secondary" onClick={handleManageBilling}>
                {isFreeTier ? 'View Receipts' : 'Manage Billing'}
              </Button>
              {!isFreeTier && (
                <Button variant="ghost" onClick={() => setCancelConfirm(true)}>
                  Cancel Plan
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Credit Balance */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between gap-6">
            <div>
              <h3 className="font-medium text-primary">Prepaid API Credits</h3>
              <p className="text-sm text-muted mt-1">
                Purchased credits are used after your plan&apos;s included monthly requests.
              </p>
            </div>
            <div className="text-right">
              <div className="text-sm text-muted">Available</div>
              <div className="text-3xl font-bold text-primary mt-1">
                {subLoading ? '...' : (subscription?.credits?.purchasedRemaining ?? 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted mt-1">
                Plan includes{' '}
                {subscription?.credits?.monthlyIncluded === 'unlimited'
                  ? 'unlimited monthly requests'
                  : `${subscription?.credits?.monthlyIncluded?.toLocaleString() || 0} monthly requests`}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Period Usage */}
      {billing && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium text-primary mb-4">Current Period</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-sm text-muted">Included Requests</div>
                <div className="text-xl font-bold text-primary mt-1">
                  {billing.requests.included.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Used</div>
                <div className="text-xl font-bold text-primary mt-1">
                  {billing.requests.used.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Overage</div>
                <div className="text-xl font-bold text-primary mt-1">
                  {billing.requests.overage.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-sm text-muted">Estimated Total</div>
                <div className="text-xl font-bold text-primary mt-1">
                  ${billing.costs.total.toFixed(2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Credit Packs */}
      <div>
        <h3 className="text-lg font-semibold text-primary mb-4">Buy API Credits</h3>
        <div className="grid gap-4 md:grid-cols-3">
          {creditPacks?.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                pack.featured && 'border-accent/50'
              )}
            >
              <CardContent className="p-6">
                {pack.featured && (
                  <span className="text-xs bg-accent text-white px-2 py-0.5 rounded mb-2 inline-block">
                    Best value
                  </span>
                )}
                <h4 className="text-lg font-semibold text-primary">{pack.name}</h4>
                <div className="mt-2">
                  <span className="text-3xl font-bold text-primary">${pack.price.toFixed(2)}</span>
                </div>
                <p className="text-sm text-muted mt-2">{pack.description}</p>

                <div className="mt-4 rounded-xl bg-secondary p-4">
                  <div className="text-sm text-muted">Credits added</div>
                  <div className="text-2xl font-bold text-primary mt-1">
                    {pack.credits.toLocaleString()}
                  </div>
                  <div className="text-xs text-muted mt-1">
                    1 credit = 1 API request
                  </div>
                </div>

                <Button
                  className="w-full mt-6"
                  variant={pack.featured ? 'primary' : 'secondary'}
                  onClick={() => handleBuyCredits(pack.id)}
                  disabled={creditCheckoutMutation.isPending}
                >
                  {creditCheckoutMutation.isPending ? 'Loading...' : 'Buy Credits'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Plans */}
      <div>
        <h3 className="text-lg font-semibold text-primary mb-4">Available Plans</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {plans?.map((plan) => {
            const isCurrent = plan.id === currentTier
            const isUpgrade =
              (currentTier === 'API_FREE' && plan.id !== 'API_FREE') ||
              (currentTier === 'API_STARTER' && plan.id === 'API_PRO')

            return (
              <Card
                key={plan.id}
                className={cn(
                  isCurrent && 'border-accent',
                  plan.recommended && 'border-accent/50'
                )}
              >
                <CardContent className="p-6">
                  {plan.recommended && (
                    <span className="text-xs bg-accent text-white px-2 py-0.5 rounded mb-2 inline-block">
                      Recommended
                    </span>
                  )}
                  <h4 className="text-lg font-semibold text-primary">{plan.name}</h4>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-primary">
                      ${plan.priceMonthly}
                    </span>
                    <span className="text-muted">/month</span>
                  </div>
                  <p className="text-sm text-muted mt-2">{plan.description}</p>

                  <ul className="mt-4 space-y-2">
                    <li className="text-sm text-primary flex items-center gap-2">
                      <span className="text-accent">✓</span>
                      {plan.monthlyRequests === 'unlimited'
                        ? 'Unlimited requests'
                        : `${plan.monthlyRequests.toLocaleString()} requests/month`}
                    </li>
                    <li className="text-sm text-primary flex items-center gap-2">
                      <span className="text-accent">✓</span>
                      {plan.requestsPerMinute} requests/minute
                    </li>
                    {plan.features.slice(2, 4).map((feature, i) => (
                      <li key={i} className="text-sm text-primary flex items-center gap-2">
                        <span className="text-accent">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    {isCurrent ? (
                      <Button variant="secondary" className="w-full" disabled>
                        Current Plan
                      </Button>
                    ) : plan.id === 'API_ENTERPRISE' ? (
                      <a
                        href="mailto:sales@promptomize.app"
                        className="inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[var(--border)] hover:bg-[var(--bg-tertiary)] h-11 px-5 text-base w-full"
                      >
                        Contact Sales
                      </a>
                    ) : isUpgrade ? (
                      <Button
                        className="w-full"
                        onClick={() =>
                          handleUpgrade(plan.id as 'API_STARTER' | 'API_PRO')
                        }
                        disabled={checkoutMutation.isPending}
                      >
                        {checkoutMutation.isPending ? 'Loading...' : 'Upgrade'}
                      </Button>
                    ) : (
                      <Button variant="secondary" className="w-full" disabled>
                        {plan.priceMonthly === 0 ? 'Free' : 'Downgrade'}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Invoices */}
      {invoices && invoices.length > 0 && (
        <Card>
          <CardContent className="p-6">
            <h3 className="font-medium text-primary mb-4">Recent Invoices</h3>
            <div className="space-y-3">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between py-2 border-b border-border last:border-0"
                >
                  <div>
                    <div className="text-sm text-primary">
                      {invoice.number || `Invoice ${invoice.id.slice(0, 8)}`}
                    </div>
                    <div className="text-xs text-muted">
                      {new Date(invoice.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span
                      className={cn(
                        'text-xs px-2 py-0.5 rounded',
                        invoice.status === 'paid'
                          ? 'bg-green-500/10 text-green-600'
                          : 'bg-yellow-500/10 text-yellow-600'
                      )}
                    >
                      {invoice.status}
                    </span>
                    <span className="font-medium text-primary">
                      ${invoice.amount.toFixed(2)}
                    </span>
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent text-sm hover:underline"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-sm mx-4">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-primary mb-2">Cancel Subscription</h3>
              <p className="text-sm text-muted mb-6">
                Your subscription will be canceled at the end of the current billing period.
                You&apos;ll keep access until then.
              </p>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setCancelConfirm(false)} className="flex-1">
                  Keep Plan
                </Button>
                <Button
                  variant="danger"
                  onClick={handleCancel}
                  className="flex-1"
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? 'Canceling...' : 'Cancel Plan'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
