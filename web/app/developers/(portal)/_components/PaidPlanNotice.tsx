'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DEVELOPER_BILLING_PATH } from '@/lib/developer/plan-access'

interface PaidPlanNoticeProps {
  /** Hide the call to action on the billing page itself, where the plans are listed below. */
  showAction?: boolean
}

export function PaidPlanNotice({ showAction = true }: PaidPlanNoticeProps) {
  return (
    <Card className="border-accent/50">
      <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-primary font-medium">
            A paid API plan is required to enhance prompts
          </h3>
          <p className="text-muted mt-1 text-sm">
            Your account can create API keys and read usage, models and history, but{' '}
            <code className="font-mono">/public/enhance</code> returns{' '}
            <code className="font-mono">402 API_PLAN_REQUIRED</code> until you choose a plan.
          </p>
        </div>
        {showAction && (
          <Link href={DEVELOPER_BILLING_PATH} className="shrink-0">
            <Button size="sm">Choose a plan</Button>
          </Link>
        )}
      </CardContent>
    </Card>
  )
}
