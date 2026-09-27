import type { FastifyPluginAsync } from 'fastify';
import { PUBLIC_PLAN_IDS, PLANS, TRIAL_DAYS } from '../../../shared/constants/plans.js';

/**
 * Public pricing catalog — no authentication.
 *
 * Security/commercial invariant: this serializer only ever exposes plans in
 * PUBLIC_PLAN_IDS, and never exposes internal fields (visit limits, legacy
 * plan names) or private pricing. Founding-customer pricing lives in
 * `constants/offers.ts` for the marketing page and must never appear here —
 * the prices this endpoint returns are the real billed list prices.
 */
export function serializePublicPlans() {
  return {
    trialDays: TRIAL_DAYS,
    currency: 'EGP',
    plans: PUBLIC_PLAN_IDS.map((id) => {
      const plan = PLANS[id];
      return {
        id: plan.id,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        priceEgp: plan.priceEgp,
        featured: plan.featured,
        taglineAr: plan.taglineAr,
        taglineEn: plan.taglineEn,
        featuresAr: plan.featuresAr,
        featuresEn: plan.featuresEn,
        limits: {
          maxDesks: plan.limits.maxDesks,
          maxBranches: plan.limits.maxBranches,
          maxUsers: plan.limits.maxUsers,
        },
      };
    }),
  };
}

const publicPlanRoutes: FastifyPluginAsync = async (app) => {
  app.get('/plans', async (_request, reply) => {
    return reply.send({ success: true, data: serializePublicPlans() });
  });
};

export default publicPlanRoutes;