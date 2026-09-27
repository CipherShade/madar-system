import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingUp, Undo2 } from 'lucide-react';
import { Metric, Pill } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, LoadingBlock, SectionHeader, SectionTable } from './primitives';
import { formatNumber } from './format';
import { planPill } from './plan';
import type { RevenueReport } from './types';

function monthLabel(key: string, locale: string): string {
  const [year, month] = key.split('-').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return key;
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export function RevenueSection() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-EG' : 'ar-EG';
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      setData(await api<RevenueReport>('/admin/revenue?months=6'));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const maxHistory = data ? Math.max(1, ...data.history.map((point) => point.amount)) : 1;
  const planEntries = data ? Object.entries(data.mrrByPlan) : [];

  return (
    <div>
      <SectionHeader titleKey="superAdmin.revenue.title" subtitleKey="superAdmin.revenue.subtitle" onRefresh={() => void load()} />

      {loading ? (
        <LoadingBlock labelKey="superAdmin.common.loading" />
      ) : failed || !data ? (
        <ErrorBlock labelKey="superAdmin.revenue.loadError" onRetry={() => void load()} />
      ) : (
        <>
          <div className="metrics-grid" style={{ marginBottom: 24 }}>
            <Metric label={t('superAdmin.revenue.mrr')} value={money(data.mrr, locale)} icon={TrendingUp} />
            <Metric label={t('superAdmin.revenue.thisMonth')} value={money(data.revenueThisMonth, locale)} icon={TrendingUp} />
            <Metric label={t('superAdmin.revenue.atRisk')} value={money(data.atRiskRevenue, locale)} icon={AlertTriangle} />
            <Metric label={t('superAdmin.revenue.pastDue')} value={formatNumber(data.movements.pastDue)} icon={AlertTriangle} />
            <Metric label={t('superAdmin.revenue.stalePending', { days: data.stalePendingAfterDays })} value={formatNumber(data.movements.stalePending)} icon={AlertTriangle} />
            <Metric label={t('superAdmin.revenue.refunds')} value={money(data.adjustments.refunds, locale)} icon={Undo2} />
          </div>

          <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 12 }}>{t('superAdmin.revenue.history')}</h3>
              {data.history.length === 0 ? (
                <EmptyBlock labelKey="superAdmin.revenue.historyEmpty" />
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {data.history.map((point) => (
                    <div key={point.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                      <span style={{ minWidth: 92, color: 'var(--color-muted, #64748b)' }}>{monthLabel(point.key, locale)}</span>
                      <span
                        style={{
                          flex: 1,
                          height: 10,
                          borderRadius: 6,
                          background: 'var(--border-color, rgba(0,0,0,0.08))',
                          overflow: 'hidden',
                        }}
                      >
                        <span
                          style={{
                            display: 'block',
                            height: '100%',
                            width: `${Math.round((point.amount / maxHistory) * 100)}%`,
                            background: 'var(--color-primary, #0f766e)',
                          }}
                        />
                      </span>
                      <span style={{ minWidth: 110, textAlign: 'end' }}>
                        <strong>{money(point.amount, locale)}</strong>
                        <br />
                        <span className="page-sub" style={{ fontSize: 11 }}>{t('superAdmin.revenue.subscriptionsCount', { count: point.count })}</span>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h3 className="page-title" style={{ fontSize: 15, marginBottom: 12 }}>{t('superAdmin.revenue.byPlan')}</h3>
              {planEntries.length === 0 ? (
                <EmptyBlock labelKey="superAdmin.revenue.byPlanEmpty" />
              ) : (
                <SectionTable
                  labelKey="superAdmin.revenue.byPlan"
                  headers={['superAdmin.revenue.col.plan', 'superAdmin.revenue.col.mrr']}
                  colSpan={2}
                >
                  {planEntries.map(([plan, amount]) => {
                    const pill = planPill(plan);
                    return (
                      <tr key={plan}>
                        <td><Pill tone={pill.tone}>{pill.label}</Pill></td>
                        <td><strong>{money(amount, locale)}</strong></td>
                      </tr>
                    );
                  })}
                </SectionTable>
              )}
            </div>
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 className="page-title" style={{ fontSize: 15, marginBottom: 12 }}>{t('superAdmin.revenue.movements')}</h3>
            <SectionTable
              labelKey="superAdmin.revenue.movements"
              headers={['superAdmin.revenue.col.movement', 'superAdmin.revenue.col.value']}
              colSpan={2}
            >
              <tr>
                <td>{t('superAdmin.revenue.newSubscriptions')}</td>
                <td>{formatNumber(data.movements.newSubscriptions)}</td>
              </tr>
              <tr>
                <td>{t('superAdmin.revenue.canceledSubscriptions')}</td>
                <td>{formatNumber(data.movements.canceledSubscriptions)}</td>
              </tr>
              <tr>
                <td>{t('superAdmin.revenue.discounts')}</td>
                <td>{money(data.adjustments.discounts, locale)}</td>
              </tr>
              <tr>
                <td>{t('superAdmin.revenue.credits')}</td>
                <td>{money(data.adjustments.credits, locale)}</td>
              </tr>
            </SectionTable>
          </div>
        </>
      )}
    </div>
  );
}
