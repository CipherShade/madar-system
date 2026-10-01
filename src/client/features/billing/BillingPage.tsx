import { useState, useEffect } from 'react';
import { Check, Sparkles, History, ExternalLink, Clock, ShieldAlert, Snowflake } from 'lucide-react';
import { notify } from '../../components/ui/kit';
import { InstapayQr } from '../../components/ui/InstapayQr';
import { apiUrl } from '../../lib/config';
import { money } from '../../lib/api';
import { billingConfig } from '../../lib/billingConfig';
import { MADAR_OFFER, foundingDiscountPercent } from '../../../shared/constants/offers';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY, TRIAL_DAYS } from '../../../shared/constants/subscription';
import type { TenantLifecycleState } from '../../../server/lib/tenantLifecycle';

const INSTAPAY_ACCOUNT_REGEX = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;

type SubscriptionItem = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  paymentMethod: string;
  paymentReference: string;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
};

type TenantDetails = {
  id: string;
  name: string;
  slug: string;
  trialEndsAt: string | null;
  isActive: boolean;
};

type Lifecycle = {
  state: TenantLifecycleState;
  canWrite: boolean;
  readOnly: boolean;
  daysUntilExpiry: number | null;
  freezesAt: string | null;
  reminder: { code: string; severity: 'info' | 'warning' | 'critical'; messageAr: string } | null;
};

type Usage = {
  periodStart: string;
  usedVisits: number;
  summaryAvailable: boolean;
};

const STATUS_LABELS: Record<string, { ar: string; ok: boolean }> = {
  PENDING: { ar: 'قيد التأكيد', ok: false },
  ACTIVE: { ar: 'مفعل', ok: true },
  TRIALING: { ar: 'تجربة', ok: true },
  PAST_DUE: { ar: 'متأخر', ok: false },
  CANCELED: { ar: 'ملغي', ok: false },
  EXPIRED: { ar: 'منتهي', ok: false },
  REJECTED: { ar: 'مرفوض', ok: false },
};

const LIFECYCLE_BANNER: Partial<Record<TenantLifecycleState, { bg: string; border: string; color: string; icon: typeof Clock }>> = {
  EXPIRING: { bg: '#fffbeb', border: '#fde68a', color: '#78350f', icon: Clock },
  GRACE: { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412', icon: ShieldAlert },
  FROZEN: { bg: '#fef2f2', border: '#fecaca', color: '#7f1d1d', icon: Snowflake },
  AWAITING_APPROVAL: { bg: '#eef2ff', border: '#c7d2fe', color: '#3730a3', icon: Clock },
};

export function BillingPage() {
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(false);
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [paymentReference, setPaymentReference] = useState('');
  const [isRenewing, setIsRenewing] = useState(false);
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
          lifecycle?: Lifecycle;
          usage?: Usage;
          subscriptions: SubscriptionItem[];
        };
      };
      if (json.data) {
        setTenant(json.data.tenant);
        setTrialDaysRemaining(json.data.trialDaysRemaining);
        setIsTrialActive(json.data.isTrialActive);
        setLifecycle(json.data.lifecycle ?? null);
        setUsage(json.data.usage ?? null);
        setSubscriptions(json.data.subscriptions);
      }
    } catch {
      notify('تعذر تحميل بيانات الاشتراك', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptionDetails();
  }, []);

  const handleRenewSubmit = async () => {
    const instapayRef = paymentReference.trim();
    if (!INSTAPAY_ACCOUNT_REGEX.test(instapayRef)) {
      notify('أدخل اسم حسابك في إنستاباي بالصيغة الصحيحة (مثل: name@instapay)', 'error');
      return;
    }
    setIsRenewing(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/renew'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          paymentMethod: 'INSTAPAY',
          paymentReference: instapayRef,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || json.error?.messageEn || 'فشلت عملية الدفع');
      notify('تم استلام طلب الدفع، وهو الآن قيد التأكيد من إدارة المنصة.', 'success');
      setShowPaymentModal(false);
      setPaymentReference('');
      void fetchSubscriptionDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الدفع';
      notify(msg, 'error');
    } finally {
      setIsRenewing(false);
    }
  };

  if (loading) {
    return (
      <div className="page" style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>جاري تحميل بيانات الاشتراك والفوترة...</p>
      </div>
    );
  }

  const instapayAccount = billingConfig.paymentAccounts.INSTAPAY;
  const instapayLink = 'paymentLink' in instapayAccount && instapayAccount.paymentLink ? instapayAccount.paymentLink : null;
  const pendingSubscription = subscriptions.find((sub) => sub.status === 'PENDING') ?? null;
  const discountPercent = foundingDiscountPercent(MADAR_OFFER);
  const lifecycleBanner = lifecycle ? LIFECYCLE_BANNER[lifecycle.state] : undefined;
  const needsPayment = !lifecycle || lifecycle.state === 'AWAITING_APPROVAL' || lifecycle.state === 'GRACE' || lifecycle.state === 'FROZEN' || lifecycle.state === 'EXPIRING';
  const isPaid = lifecycle?.state === 'ACTIVE' || lifecycle?.state === 'EXPIRING';

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">إدارة الاشتراك والفوترة</h1>
          <p className="page-sub">اشتراك واحد غير محدود، وسجل مدفوعات الاشتراك بالجنيه المصري.</p>
        </div>
      </div>

      {pendingSubscription && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f59e0b', color: '#3b2400', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
            <Clock className="h-6 w-6" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <b style={{ fontSize: 15 }}>دفعتك قيد التأكيد</b>
            <p style={{ fontSize: 13, color: '#78350f', margin: '2px 0 0' }}>
              مبلغ {money(Number(pendingSubscription.amount))} عبر إنستاباي (المرجع: <code dir="ltr">{pendingSubscription.paymentReference}</code>).
              لن يُفعَّل الشهر المدفوع ولا يتغيّر ما يعمل في المركز قبل تأكيد استلام الدفعة يدويًا.
            </p>
          </div>
          <span style={{ fontSize: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 99, padding: '4px 12px', fontWeight: 700 }}>
            بانتظار التأكيد
          </span>
        </div>
      )}

      {lifecycleBanner && lifecycle?.reminder && (
        <div style={{ background: lifecycleBanner.bg, border: `1px solid ${lifecycleBanner.border}`, color: lifecycleBanner.color, borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <lifecycleBanner.icon className="h-6 w-6 shrink-0" aria-hidden="true" />
          <p style={{ fontSize: 14, margin: 0, flex: 1, minWidth: 220 }}>{lifecycle.reminder.messageAr}</p>
          {needsPayment && (
            <button type="button" className="btn btn--primary" onClick={() => setShowPaymentModal(true)}>
              ادفع الآن
            </button>
          )}
        </div>
      )}

      {isTrialActive && (
        <div className="billing-banner" style={{ background: '#e8f5ef', border: '1px solid #c9e8db', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 220 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#0e7c56', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <b style={{ fontSize: 16, color: '#043128' }}>أنت الآن في فترة التجربة المجانية ({TRIAL_DAYS} يوم)</b>
              <p style={{ fontSize: 13, color: '#0b6a4a', margin: '2px 0 0' }}>
                متبقي {trialDaysRemaining} يوم على انتهاء التجربة. الاشتراك غير محدود: لا يوجد حد على عدد الطلاب أو الزيارات أو الفروع أو موظفي الاستقبال.
              </p>
            </div>
          </div>
          <button type="button" className="btn btn--primary cta-full" onClick={() => setShowPaymentModal(true)}>
            تفعيل الاشتراك
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: '#043128', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Sparkles className="h-6 w-6" />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <b style={{ fontSize: 16 }}>اشتراك {MADAR_OFFER.nameAr}</b>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '2px 0 0' }}>{MADAR_OFFER.taglineAr}</p>
        </div>
        <div style={{ fontSize: 13, textAlign: 'end' }}>
          <b style={{ display: 'block', fontSize: 18 }}>{money(MONTHLY_PRICE_EGP)} / شهرياً</b>
          {discountPercent !== null && (
            <s style={{ color: '#6b7280' }}>{money(MADAR_OFFER.listPriceEgp)}</s>
          )}
        </div>
        <div style={{ width: '100%', fontSize: 13, color: '#6b7280' }}>
          {tenant ? `مركزك: ${tenant.name} · ` : ''}
          {isPaid ? 'اشتراكك مدفوع وساري.' : isTrialActive ? 'التجربة المجانية سارية.' : 'لا يوجد اشتراك مدفوع ساري بعد.'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20, marginBottom: 32 }}>
        <div
          style={{
            background: '#043128',
            color: '#fff',
            border: `2px solid ${isPaid ? '#0e7c56' : '#0e7c56'}`,
            borderRadius: 18,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 32px -8px rgba(4, 49, 40, 0.4)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{MADAR_OFFER.nameAr}</h3>
            {isPaid ? (
              <span style={{ background: '#e8f5ef', color: '#0e7c56', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }}>
                اشتراكك الحالي
              </span>
            ) : (
              <span style={{ background: '#f59e0b', color: '#3b2400', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }}>
                {MADAR_OFFER.highlightAr}
              </span>
            )}
          </div>
          <p style={{ fontSize: 13, color: '#a3d9c1', minHeight: 40 }}>{MADAR_OFFER.taglineAr}</p>
          <div style={{ fontSize: 32, fontWeight: 800, margin: '14px 0', color: '#fff' }}>
            {money(MADAR_OFFER.foundingPriceEgp)} <span style={{ fontSize: 14, color: '#a3d9c1' }}>/ شهرياً · {SUBSCRIPTION_CURRENCY}</span>
          </div>

          <ul style={{ display: 'grid', gap: 10, margin: '14px 0 24px', flex: 1, fontSize: 13 }}>
            {MADAR_OFFER.featuresAr.map((feature) => (
              <li key={feature} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Check className="h-4 w-4 shrink-0 text-emerald-400" /> {feature}
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="btn btn--primary"
            style={{ background: '#fff', color: '#043128', fontWeight: 800 }}
            onClick={() => setShowPaymentModal(true)}
          >
            {isPaid ? 'تجديد الاشتراك' : 'الاشتراك الآن'}
          </button>
        </div>
      </div>

      {usage && (
        <div className="card" style={{ padding: 18, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>استخدامك هذا الشهر</h3>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 10px' }}>
            عدد الزيارات منذ {new Date(usage.periodStart).toLocaleDateString('ar-EG')} — معلومة إرشادية فقط، ولا يوجد حد يمنع العمل عند تجاوزها.
          </p>
          <b style={{ fontSize: 24 }}>{usage.usedVisits.toLocaleString('ar-EG')}</b>
          <span style={{ fontSize: 13, color: '#6b7280' }}> زيارة</span>
        </div>
      )}

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
                  <th>تاريخ الطلب</th>
                  <th>المبلغ</th>
                  <th>الفترة المدفوعة</th>
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
                      <td>{money(Number(sub.amount))}</td>
                      <td style={{ fontSize: 12 }}>
                        {new Date(sub.periodStart).toLocaleDateString('ar-EG')} — {new Date(sub.periodEnd).toLocaleDateString('ar-EG')}
                      </td>
                      <td>{sub.paymentMethod === 'VODAFONE_CASH' ? 'فودافون كاش' : sub.paymentMethod === 'INSTAPAY' ? 'إنستاباي' : 'كاش'}</td>
                      <td><code style={{ fontSize: 11 }} dir="ltr">{sub.paymentReference}</code></td>
                      <td><span className={`badge ${status.ok ? 'badge--ok' : 'badge--warn'}`}>{status.ar}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showPaymentModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }}>
          <div className="card" style={{ maxWidth: 460, width: '100%', padding: 24, maxHeight: 'min(88vh, 680px)', overflowY: 'auto' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              تأكيد الدفع لاشتراك {MADAR_OFFER.nameAr}
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
              المبلغ المطلوب: <b>{money(MONTHLY_PRICE_EGP)} / شهر</b>
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

              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
                الاشتراك لا يُفعَّل تلقائياً. تُراجع كل دفعة يدوياً قبل أن يبدأ الشهر المدفوع.
              </p>

              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn--secondary"
                  style={{ flex: 1 }}
                  onClick={() => setShowPaymentModal(false)}
                  disabled={isRenewing}
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  style={{ flex: 2 }}
                  onClick={handleRenewSubmit}
                  disabled={isRenewing}
                >
                  {isRenewing ? 'جاري الإرسال...' : 'تأكيد الدفع'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
