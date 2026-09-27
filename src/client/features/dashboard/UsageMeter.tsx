import { useTranslation } from 'react-i18next';
import { AlertCircle, AlertTriangle, ArrowUpRight, BarChart3, Building2, Sparkles, UserCheck, Users, Zap } from 'lucide-react';
import { Pill } from '../../components/ui/kit';

export interface UsageData {
  tenantId: string;
  tenantName: string;
  plan: {
    id: string;
    name: string;
    nameAr: string;
    priceEgp: number;
    monthlyVisitLimit: number;
    maxReceptionists: number | null;
    maxBranches: number | null;
    positioningAr: string;
    positioningEn: string;
    isPopular?: boolean;
  };
  periodStart: string;
  periodEnd: string;
  usedVisits: number;
  monthlyLimit: number;
  remainingVisits: number;
  percentage: number;
  warningLevel: 'NONE' | 'WARNING_80' | 'WARNING_90' | 'LIMIT_REACHED';
  warningMessageAr: string | null;
  warningMessageEn: string | null;
  isBlocked: boolean;
  receptionistCount: number;
  receptionistLimit: number | null;
  canAddReceptionist: boolean;
  branchCount: number;
  branchLimit: number | null;
  canAddBranch: boolean;
}

interface UsageMeterProps {
  usage: UsageData | null;
  loading?: boolean;
  onNavigateToBilling: () => void;
}

export function UsageMeter({ usage, loading, onNavigateToBilling }: UsageMeterProps) {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';

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

  const {
    plan,
    usedVisits,
    monthlyLimit,
    remainingVisits,
    percentage,
    warningLevel,
    receptionistCount,
    receptionistLimit,
    branchCount,
    branchLimit,
  } = usage;

  // Visual Tone for progress bar and cards
  let progressColor = 'var(--primary, #0e7c56)';
  let bannerBg = '#f0faf5';
  let bannerBorder = '#c9e8db';
  let bannerText = '#043128';

  if (warningLevel === 'LIMIT_REACHED') {
    progressColor = '#ef4444';
    bannerBg = '#fef2f2';
    bannerBorder = '#fecaca';
    bannerText = '#991b1b';
  } else if (warningLevel === 'WARNING_90') {
    progressColor = '#f97316';
    bannerBg = '#fff7ed';
    bannerBorder = '#ffedd5';
    bannerText = '#9a3412';
  } else if (warningLevel === 'WARNING_80') {
    progressColor = '#eab308';
    bannerBg = '#fefce8';
    bannerBorder = '#fef08a';
    bannerText = '#854d0e';
  }

  return (
    <div style={{ marginBottom: 24 }}>
      {/* ── Contextual Warning / Limit Alert Banner ─────────────────────── */}
      {warningLevel !== 'NONE' && (
        <div
          role="alert"
          aria-live="assertive"
          style={{
            background: bannerBg,
            border: `1px solid ${bannerBorder}`,
            borderRadius: 14,
            padding: '16px 20px',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: progressColor,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
              {warningLevel === 'LIMIT_REACHED' ? (
                <AlertCircle className="h-5 w-5" />
              ) : (
                <AlertTriangle className="h-5 w-5" />
              )}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 15, color: bannerText }}>
                {warningLevel === 'LIMIT_REACHED'
                  ? t('usage.limitReachedTitle')
                  : warningLevel === 'WARNING_90'
                  ? t('usage.warning90Title')
                  : t('usage.warning80Title')}
              </div>
              <div style={{ fontSize: 13, color: bannerText, opacity: 0.9, marginTop: 2 }}>
                {isArabic ? usage.warningMessageAr : usage.warningMessageEn}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary"
            style={{
              background: progressColor,
              borderColor: progressColor,
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
            onClick={onNavigateToBilling}
          >
            <Sparkles className="h-4 w-4" />
            {t('usage.upgradeCta')}
          </button>
        </div>
      )}

      {/* ── Main Usage Meter Card ───────────────────────────────────────── */}
      <div className="card card-pad" style={{ background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
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
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0 }}>{t('usage.title')}</h3>
              <p style={{ fontSize: 12, color: 'var(--muted, #6b7280)', margin: 0 }}>
                {t('usage.subtitle')} ({plan.name})
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Pill tone={warningLevel === 'LIMIT_REACHED' ? 'danger' : warningLevel === 'WARNING_90' ? 'accent' : 'primary'}>
              {isArabic ? plan.nameAr : plan.name} · {plan.priceEgp} {t('plans.perMonth')}
            </Pill>
            <button
              type="button"
              className="btn btn--soft btn--sm"
              onClick={onNavigateToBilling}
              style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              {t('usage.upgradeCta')}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Meter Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 16,
            padding: '14px 16px',
            background: '#f9fafb',
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          {/* Monthly Student Visits */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users className="h-3.5 w-3.5" />
              <span>{t('usage.monthlyVisitsLabel')}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
              {usedVisits.toLocaleString(isArabic ? 'ar-EG' : 'en-US')} / {monthlyLimit.toLocaleString(isArabic ? 'ar-EG' : 'en-US')}
            </div>
            <div style={{ fontSize: 11, color: progressColor, fontWeight: 700, marginTop: 2 }}>
              {percentage}% {isArabic ? 'مستخدم' : 'used'} · {remainingVisits.toLocaleString(isArabic ? 'ar-EG' : 'en-US')} {isArabic ? 'متبقية' : 'remaining'}
            </div>
          </div>

          {/* Receptionist Accounts */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <UserCheck className="h-3.5 w-3.5" />
              <span>{t('usage.receptionistsLabel')}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
              {receptionistCount.toLocaleString(isArabic ? 'ar-EG' : 'en-US')} / {receptionistLimit ? receptionistLimit.toLocaleString(isArabic ? 'ar-EG' : 'en-US') : (isArabic ? 'غير محدود' : 'Unlimited')}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {receptionistLimit === null ? (isArabic ? 'حسابات استقبال غير محدودة' : 'Unlimited accounts') : (isArabic ? `الحد الأقصى: ${receptionistLimit}` : `Limit: ${receptionistLimit}`)}
            </div>
          </div>

          {/* Branches */}
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Building2 className="h-3.5 w-3.5" />
              <span>{t('usage.branchesLabel')}</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }}>
              {branchCount.toLocaleString(isArabic ? 'ar-EG' : 'en-US')} / {branchLimit ? branchLimit.toLocaleString(isArabic ? 'ar-EG' : 'en-US') : (isArabic ? 'متعدد الفروع' : 'Multi-Branch')}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
              {branchLimit === null ? (isArabic ? 'فروع غير محدودة' : 'Unlimited branches') : (isArabic ? 'فرع واحد' : '1 branch')}
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6, fontWeight: 700 }}>
            <span style={{ color: '#374151' }}>
              {isArabic ? 'استهلاك الزيارات الشهرية' : 'Monthly Visit Consumption'}
            </span>
            <span style={{ color: progressColor }}>
              {percentage}%
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 10,
              background: '#e5e7eb',
              borderRadius: 99,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, percentage)}%`,
                height: '100%',
                background: progressColor,
                borderRadius: 99,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
