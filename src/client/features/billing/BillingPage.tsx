import { useState, useEffect } from 'react';
import { Check, Sparkles, History, TriangleAlert, TrendingUp, ExternalLink, Clock } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { notify } from '../../components/ui/kit';
import { InstapayQr } from '../../components/ui/InstapayQr';
import { apiUrl } from '../../lib/config';
import { money } from '../../lib/api';
import { billingConfig } from '../../lib/billingConfig';
import { PURCHASABLE_PLAN_IDS, PLANS, getPlanConfig } from '../../../shared/constants/plans';
import type { VisitUsage } from '../../../shared/constants/plans';

const INSTAPAY_ACCOUNT_REGEX = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;

type SubscriptionItem = {
  id: string;
  plan: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  createdAt: string;
};

type TenantDetails = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  trialEndsAt: string | null;
  isActive: boolean;
  maxDesks: number;
  maxBranches: number;
  maxUsers: number;
  visitLimit: number | null;
};

const STATUS_LABELS: Record<string, { ar: string; ok: boolean }> = {
  PENDING: { ar: 'قيد التأكيد', ok: false },
  ACTIVE: { ar: 'مفعل', ok: true },
  TRIALING: { ar: 'تجربة', ok: true },
  PAST_DUE: { ar: 'متأخر', ok: false },
  CANCELED: { ar: 'ملغي', ok: false },
  EXPIRED: { ar: 'منتهي', ok: false },
};

export function BillingPage() {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(false);
  const [usage, setUsage] = useState<VisitUsage | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<(typeof PURCHASABLE_PLAN_IDS)[number]>(PURCHASABLE_PLAN_IDS[0]);
  const [paymentReference, setPaymentReference] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  const fetchSubscriptionDetails = async () => {
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/subscriptions/current'), { credentials: 'include' });
      const json = (await res.json()) as {
        data?: {
          tenant: TenantDetails;
          trialDaysRemaining: number;
          isTrialActive: boolean;
          usage?: { periodStart: string; visits: VisitUsage };
          subscriptions: SubscriptionItem[];
        };
      };
      if (json.data) {
        setTenant(json.data.tenant);
        setTrialDaysRemaining(json.data.trialDaysRemaining);
        setIsTrialActive(json.data.isTrialActive);
        setUsage(json.data.usage?.visits ?? null);
        setSubscriptions(json.data.subscriptions);
      }
    } catch {
      // fallback: page renders from shared plan config only
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptionDetails();
  }, []);

  const handleUpgradeSubmit = async () => {
    const instapayRef = paymentReference.trim();
    if (!INSTAPAY_ACCOUNT_REGEX.test(instapayRef)) {
      notify('أدخل اسم حسابك في إنستاباي بالصيغة الصحيحة (مثل: name@instapay)', 'error');
      return;
    }
    setIsUpgrading(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/upgrade'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: selectedPlan,
          paymentMethod: 'INSTAPAY',
          paymentReference: instapayRef,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'فشلت عملية الترقية');
      notify('تم تفعيل الاشتراك بنجاح! ✓', 'success');
      setShowPaymentModal(false);
      setPaymentReference('');
      void fetchSubscriptionDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الترقية';
      notify(msg, 'error');
    } finally {
      setIsUpgrading(false);
    }
  };

  const openPaymentModal = (planId: (typeof PURCHASABLE_PLAN_IDS)[number]) => {
    setSelectedPlan(planId);
    setShowPaymentModal(true);
  };

  if (loading) {
    return (
      <div className="page" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>جاري تحميل بيانات الاشتراك والفوترة...</p>
      </div>
    );
  }

  const currentPlanKey = tenant?.plan || user?.tenant?.plan || 'FREE_TRIAL';
  const currentConfig = getPlanConfig(currentPlanKey);
  const selectedConfig = PLANS[selectedPlan];
  const usageBanner = usage && usage.limit !== null && usage.level !== 'ok' ? usage : null;
  const instapayAccount = billingConfig.paymentAccounts.INSTAPAY;
  const instapayLink = 'paymentLink' in instapayAccount && instapayAccount.paymentLink ? instapayAccount.paymentLink : null;
  const pendingSubscription = subscriptions[0]?.status === 'PENDING' ? subscriptions[0] : null;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">إدارة الاشتراك والفوترة</h1>
          <p className="page-sub">تفاصيل باقة السنتر الحالية، ترقية الاشتراك، وسجل المدفوعات بالجنيه المصري.</p>
        </div>
      </div>

      {/* Pending INSTAPAY payment banner (payment awaiting verification) */}
      {pendingSubscription && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f59e0b', color: '#3b2400', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Clock className="h-6 w-6" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b style={{ fontSize: 15 }}>دفعتك قيد التأكيد</b>
            <p style={{ fontSize: 13, color: '#78350f', margin: '2px 0 0' }}>
              مبلغ {money(Number(pendingSubscription.amount))} عبر إنستاباي (المرجع: <code dir="ltr">{pendingSubscription.paymentReference}</code>).
              سيُفعَّل اشتراكك وتُفتح حدود الباقة فور تأكيد استلام الدفعة — وقبل ذلك يعمل المركز على حدود التجربة المجانية فقط.
            </p>
          </div>
          <span style={{ fontSize: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 99, padding: '4px 12px', fontWeight: 700 }}>
            بانتظار التأكيد
          </span>
        </div>
      )}

      {/* Trial Alert Banner */}
      {isTrialActive && (
        <div className="billing-banner" style={{ background: '#e8f5ef', border: '1px solid #c9e8db', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 220 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0e7c56', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <b style={{ fontSize: 16, color: '#043128' }}>أنت الآن في فترة التجربة المجانية (14 يوم)</b>
              <p style={{ fontSize: 13, color: '#0b6a4a', margin: '2px 0 0' }}>
                متبقي {trialDaysRemaining} يوم على انتهاء التجربة. جميع ميزات النظام متاحة لك ولطاقم العمل.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--primary cta-full"
            onClick={() => openPaymentModal(PURCHASABLE_PLAN_IDS[0])}
          >
            تفعيل الاشتراك الدائم
          </button>
        </div>
      )}

      {/* Current Plan Summary */}
      {tenant && (
        <div className="card" style={{ padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#043128', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <TrendingUp className="h-6 w-6" />
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <b style={{ fontSize: 16 }}>باقتك الحالية: {currentConfig.nameAr}</b>
            <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>{currentConfig.taglineAr}</p>
          </div>
          <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
            <div>
              <span style={{ color: '#6b7280' }}>مكاتب الاستقبال</span>
              <b style={{ display: 'block' }}>{tenant.maxDesks} مكاتب</b>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>موظفو الاستقبال</span>
              <b style={{ display: 'block' }}>{tenant.maxUsers} موظفين</b>
            </div>
          </div>
        </div>
      )}

      {/* Visit Usage Banner (advisory only) */}
      {usageBanner && (
        <div
          style={{
            background: usageBanner.level === 'over' ? '#fef2f2' : usageBanner.level === 'strong' ? '#fff7ed' : '#fffbeb',
            border: `1px solid ${usageBanner.level === 'over' ? '#fecaca' : usageBanner.level === 'strong' ? '#fed7aa' : '#fde68a'}`,
            borderRadius: 14,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <TriangleAlert className={`h-5 w-5 ${usageBanner.level === 'over' ? 'text-red-600' : usageBanner.level === 'strong' ? 'text-orange-600' : 'text-amber-500'}`} />
            <div style={{ fontSize: 13, flex: 1 }}>
              {usageBanner.level === 'over' ? (
                <p>
                  <b>تجاوزت الاستخدام الشهري للباقة ({usageBanner.used.toLocaleString('ar-EG')} زيارة).</b>{' '}
                  النظام يستمر في العمل بشكل طبيعي — لا توجد أي قيود على الاستقبال. يُنصح بالترقية لباقة أعلى لضمان سعة أكبر.
                </p>
              ) : usageBanner.level === 'strong' ? (
                <p>
                  <b>اقتربت من الحد الشهري للزيارات ({usageBanner.percent}٪).</b>{' '}
                  متبقي {usageBanner.remaining?.toLocaleString('ar-EG')} زيارة هذا الشهر. يُنصح بالترقية لباقة أعلى لضمان سعة أكبر.
                </p>
              ) : (
                <p>
                  <b>استهلكت {usageBanner.percent}٪ من سعة الزيارات الشهرية.</b>{' '}
                  متبقي {usageBanner.remaining?.toLocaleString('ar-EG')} زيارة للشهر الحالي.
                </p>
              )}
            </div>
            <button
              type="button"
              className="btn btn--primary"
              style={{ fontSize: 12, padding: '8px 14px', flexShrink: 0 }}
              onClick={() => openPaymentModal(PURCHASABLE_PLAN_IDS[PURCHASABLE_PLAN_IDS.length - 1])}
            >
              الترقية الآن
            </button>
          </div>
          <div style={{ marginTop: 12, height: 8, borderRadius: 99, background: '#eee', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${Math.min((usageBanner.percent ?? 0), 100)}%`,
                background: usageBanner.level === 'over' ? '#dc2626' : usageBanner.level === 'strong' ? '#ea580c' : '#f59e0b',
                borderRadius: 99,
              }}
            />
          </div>
        </div>
      )}

      {/* Plans Comparison — priced from the shared plan config */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20, marginBottom: 32 }}>
        {PURCHASABLE_PLAN_IDS.map((planId) => {
          const planConfig = PLANS[planId];
          const isCurrent = currentConfig.id === planId;
          const isFeatured = planConfig.featured;
          const allowSubscribe = !isCurrent || isTrialActive;
          const cardDark = isFeatured;

          return (
            <div
              key={planId}
              style={{
                background: cardDark ? '#043128' : '#fff',
                color: cardDark ? '#fff' : 'inherit',
                border: isCurrent ? '2px solid #0e7c56' : `1px solid ${cardDark ? '#0e7c56' : '#e2e0dc'}`,
                borderRadius: 18,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                boxShadow: cardDark ? '0 12px 32px -8px rgba(4, 49, 40, 0.4)' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: cardDark ? '#fff' : undefined }}>{planConfig.nameAr}</h3>
                {isCurrent && (
                  <span style={{ background: '#e8f5ef', color: '#0e7c56', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                    باقتك الحالية
                  </span>
                )}
                {isFeatured && !isCurrent && (
                  <span style={{ background: '#f59e0b', color: '#3b2400', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>
                    الأكثر طلباً للسناتر الكبيرة
                  </span>
                )}
              </div>
              <p style={{ fontSize: 13, color: cardDark ? '#a3d9c1' : '#6b7280', minHeight: 40 }}>{planConfig.taglineAr}</p>
              <div style={{ fontSize: 32, fontWeight: 800, margin: '14px 0', color: cardDark ? '#fff' : undefined }}>
                {money(planConfig.priceEgp)} <span style={{ fontSize: 14, color: cardDark ? '#a3d9c1' : '#6b7280' }}>/ شهرياً</span>
              </div>

              <ul style={{ display: 'grid', gap: 10, margin: '14px 0 24px', flex: 1, fontSize: 13 }}>
                {planConfig.featuresAr.map((feature) => (
                  <li key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check className={`h-4 w-4 ${cardDark ? 'text-emerald-400' : 'text-emerald-700'}`} /> {feature}
                  </li>
                ))}
              </ul>

              <button
                type="button"
                className={`btn ${cardDark ? 'btn--primary' : 'btn--secondary'}`}
                style={cardDark ? { background: '#fff', color: '#043128', fontWeight: 800 } : undefined}
                disabled={!allowSubscribe}
                onClick={() => openPaymentModal(planId)}
              >
                {isCurrent ? (isTrialActive ? `تفعيل باقة ${planConfig.nameAr}` : 'باقتك الحالية') : `الاشتراك في ${planConfig.nameAr}`}
              </button>
            </div>
          );
        })}
      </div>

      {/* Subscription Invoices History */}
      <div className="card" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History className="h-5 w-5 text-emerald-700" /> سجل مدفوعات الاشتراك
        </h3>

        {subscriptions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>لا توجد مدفوعات سابقة حتى الآن.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>تاريخ الدفعة</th>
                  <th>الباقة</th>
                  <th>المبلغ</th>
                  <th>طريقة الدفع</th>
                  <th>المرجع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((sub) => {
                  const status = STATUS_LABELS[sub.status] ?? { ar: sub.status, ok: false };
                  return (
                    <tr key={sub.id}>
                      <td>{new Date(sub.createdAt).toLocaleDateString('ar-EG')}</td>
                      <td><b>{getPlanConfig(sub.plan).nameAr}</b></td>
                      <td>{sub.amount} ج.م</td>
                      <td>{sub.paymentMethod === 'VODAFONE_CASH' ? 'فودافون كاش' : sub.paymentMethod === 'INSTAPAY' ? 'إنستاباي' : 'كاش'}</td>
                      <td><code style={{ fontSize: 11 }}>{sub.paymentReference}</code></td>
                      <td><span className={`badge ${status.ok ? 'badge--ok' : 'badge--warn'}`}>{status.ar}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div className="card" style={{ maxWidth: 460, width: '100%', padding: 24, maxHeight: 'min(88vh, 680px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              تأكيد تفعيل الاشتراك في باقة {selectedConfig.nameAr}
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
              المبلغ المطلوب: <b>{money(selectedConfig.priceEgp)} / شهر</b>
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ background: '#f0faf5', border: '1px solid #c9e8db', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }}>
                <InstapayQr />
                {instapayLink && (
                  <a
                    href={instapayLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--primary"
                    style={{ justifyContent: 'center', width: '100%', paddingBlock: 11 }}
                  >
                    ادفع الآن عبر رابط إنستاباي <ExternalLink className="h-4 w-4" />
                  </a>
                )}
                <div style={{ fontSize: 13, textAlign: 'center' }}>
                  <span style={{ color: '#6b7280' }}>أو حوّل إلى الحساب:</span>{' '}
                  <b dir="ltr" style={{ color: '#0e7c56' }}>{instapayAccount.accountNumber}</b>
                </div>
              </div>

              <label className="field">
                <span className="field-label">اسم حسابك في إنستاباي (الذي دفعت منه) — إثبات الدفع *</span>
                <input
                  className="input"
                  dir="ltr"
                  style={{ textAlign: 'start' }}
                  placeholder="name@instapay"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
                <small style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>
                  أدخل اسم حساب إنستاباي الذي دفعت منه بالضبط — مثل: name@instapay
                </small>
              </label>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isUpgrading}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 2 }}
                  onClick={handleUpgradeSubmit}
                  disabled={isUpgrading}
                >
                  {isUpgrading ? 'جاري التفعيل...' : 'تأكيد ودفع الاشتراك'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}