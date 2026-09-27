import { useTranslation } from 'react-i18next';
import { PLANS } from '../../../../shared/constants/plans.js';
import { TenantPlan } from '../../../../shared/constants/index.js';
import { Pill } from '../../../components/ui/kit';
import { SectionHeader, SectionTable, NoticeBlock } from './primitives';
import { formatNumber } from './format';
import { money } from '../../../lib/api';

const ORDERED_IDS: TenantPlan[] = [TenantPlan.FREE_TRIAL, TenantPlan.ESSENTIAL, TenantPlan.CONTROL, TenantPlan.MULTI_BRANCH];

/**
 * Read-only view of the pricing catalogue. It renders the shared
 * `PLANS` source of truth directly, so this screen can never drift from the
 * pricing the API actually sells.
 */
export function PlansSection() {
  const { t } = useTranslation();

  return (
    <div>
      <SectionHeader titleKey="superAdmin.plans.title" subtitleKey="superAdmin.plans.subtitle" />
      <NoticeBlock labelKey="superAdmin.plans.sourceNotice" tone="info" />

      <SectionTable
        labelKey="superAdmin.plans.table"
        headers={[
          'superAdmin.plans.col.plan',
          'superAdmin.plans.col.price',
          'superAdmin.plans.col.visibility',
          'superAdmin.plans.col.limits',
        ]}
        colSpan={4}
      >
        {ORDERED_IDS.map((id) => {
          const plan = PLANS[id];
          return (
            <tr key={id}>
              <td>
                <strong>{plan.nameAr}</strong>
                {plan.featured && (
                  <>
                    <br />
                    <Pill tone="accent">{t('superAdmin.plans.featured')}</Pill>
                  </>
                )}
                <br />
                <span className="page-sub" style={{ fontSize: 12 }}>{plan.taglineAr}</span>
              </td>
              <td>
                <b>{plan.priceEgp === 0 ? t('superAdmin.plans.free') : money(plan.priceEgp ?? 0)}</b>
                {plan.priceEgp !== 0 && <span className="page-sub"> {t('superAdmin.plans.perMonth')}</span>}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Pill tone={plan.isPublic ? 'success' : 'muted'}>
                    {t(plan.isPublic ? 'superAdmin.plans.public' : 'superAdmin.plans.internal')}
                  </Pill>
                  <Pill tone={plan.purchasable ? 'primary' : 'muted'}>
                    {t(plan.purchasable ? 'superAdmin.plans.purchasable' : 'superAdmin.plans.notPurchasable')}
                  </Pill>
                </div>
              </td>
              <td style={{ fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span>{t('superAdmin.plans.limitDesks')}: <strong>{formatNumber(plan.limits.maxDesks)}</strong></span>
                  <span>{t('superAdmin.plans.limitBranches')}: <strong>{formatNumber(plan.limits.maxBranches)}</strong></span>
                  <span>{t('superAdmin.plans.limitUsers')}: <strong>{formatNumber(plan.limits.maxUsers)}</strong></span>
                  <span>
                    {t('superAdmin.plans.limitVisits')}:{' '}
                    <strong>
                      {plan.limits.visitLimit === null
                        ? t('superAdmin.plans.unlimited')
                        : formatNumber(plan.limits.visitLimit)}
                    </strong>
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </SectionTable>
    </div>
  );
}
