import { useTranslation } from 'react-i18next';
import { ArrowUpRight, BarChart3, Building2, UserCheck, Users } from 'lucide-react';

/**
 * Advisory usage panel. The subscription is unlimited, so there is no quota to
 * fill and nothing here can warn, block, or prompt an upgrade: it reports counts
 * for the current billing period only.
 */
export interface UsageData {
  tenantId?: string;
  tenantName?: string;
  periodStart: string;
  periodEnd: string;
  usedVisits: number;
  branchUsage?: Array<{
    branchId: string | null;
    branchName: string;
    visitCount: number;
  }>;
  summaryAvailable?: boolean;
}

interface UsageMeterProps {
  usage: UsageData | null;
  loading?: boolean;
  onNavigateToBilling: () => void;
}

export function UsageMeter({ usage, loading, onNavigateToBilling }: UsageMeterProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const locale = isArabic ? 'ar-EG' : 'en-US';

  if (loading) {
    return (
      <div className="card card-pad" style={{ marginBottom: 24, opacity: 0.7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BarChart3 className="h-4 w-4 animate-pulse text-emerald-600" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>{t('usage.title')}...</span>
        </div>
      </div>
    );
  }

  if (!usage) return null;

  // Counts are display-only, so normalise anything missing rather than letting
  // a malformed payload throw inside toLocaleString() during render.
  if (typeof usage.usedVisits !== 'number') return null;

  const usedVisits = usage.usedVisits;
  const branchUsage = usage.branchUsage ?? [];
  const periodStart = new Date(usage.periodStart);
  const periodEnd = new Date(usage.periodEnd);

  return (
    <div className="card card-pad" style={{ background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'rgba(14, 124, 86, 0.1)',
              color: 'var(--primary, #0e7c56)',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <BarChart3 className="h-4 w-4" />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{t('usage.title')}</h3>
            <p style={{ fontSize: 12, color: 'var(--muted, #6b7280)', margin: 0 }}>
              {t('usage.unlimitedSubtitle')}
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn btn--soft btn--sm"
          onClick={onNavigateToBilling}
          style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          {t('common.billing')}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 16,
          padding: '14px 16px',
          background: '#f9fafb',
          borderRadius: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users className="h-3.5 w-3.5" />
            <span>{t('usage.monthlyVisitsLabel')}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
            {usedVisits.toLocaleString(locale)}
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{t('usage.unlimitedNote')}</div>
        </div>

        {branchUsage.map((branch) => (
          <div key={branch.branchId ?? branch.branchName}>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 className="h-3.5 w-3.5" />
              <span>{branch.branchName}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
              {branch.visitCount.toLocaleString(locale)}
            </div>
          </div>
        ))}

        <div>
          <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserCheck className="h-3.5 w-3.5" />
            <span>{t('usage.receptionistsLabel')}</span>
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
            {isArabic ? 'غير محدود' : 'Unlimited'}
          </div>
        </div>
      </div>

      <div style={{ fontSize: 11, color: '#6b7280', marginTop: 10 }}>
        {periodStart.toLocaleDateString(locale)} — {periodEnd.toLocaleDateString(locale)}
      </div>
    </div>
  );
}
