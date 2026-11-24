import type { RequestSubscription } from '../middleware/requireEntitlement.js';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        sessionId: string;
      };
      /** Set by requireEntitlement: the resolved SubscriptionInfo plus legacy flat fields. */
      subscription?: RequestSubscription;
    }
  }
}

export {};
