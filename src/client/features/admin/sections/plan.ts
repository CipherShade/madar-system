import { getPlanConfig } from '../../../../shared/constants/plans.js';

export type PillTone = 'primary' | 'accent' | 'success' | 'muted' | 'warning' | 'danger';

const PLAN_TONES: Record<string, PillTone> = {
  FREE_TRIAL: 'warning',
  ESSENTIAL: 'primary',
  CONTROL: 'accent',
  MULTI_BRANCH: 'success',
};

/**
 * Resolves any stored plan value (including the GROWTH/BUSINESS/ENTERPRISE
 * legacy aliases) through the shared pricing source of truth, so the control
 * panel can never drift from the catalogue used by the API and billing.
 */
export function planPill(plan: string): { label: string; tone: PillTone; isLegacyAlias: boolean } {
  const config = getPlanConfig(plan);
  return {
    label: config.nameAr,
    tone: PLAN_TONES[config.id] ?? 'muted',
    isLegacyAlias: plan !== config.id,
  };
}
