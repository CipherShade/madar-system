import type { FastifyPluginAsync } from 'fastify';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY, TRIAL_DAYS } from '../../../shared/constants/subscription.js';

/**
 * Public pricing — no authentication.
 *
 * Security/commercial invariant: this serializer publishes the real billed
 * price only. The EGP 1,999 anchor the founding discount is measured against is
 * a marketing figure from `constants/offers.ts` and must never appear here.
 */
export function serializePublicPricing() {
  return {
    trialDays: TRIAL_DAYS,
    currency: SUBSCRIPTION_CURRENCY,
    priceEgp: MONTHLY_PRICE_EGP,
    unlimited: {
      receptionStaff: true,
      branches: true,
      receptionDesks: true,
      studentVisits: true,
    },
  };
}

const publicPricingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/pricing', async (_request, reply) => {
    return reply.send({ success: true, data: serializePublicPricing() });
  });
};

export default publicPricingRoutes;
