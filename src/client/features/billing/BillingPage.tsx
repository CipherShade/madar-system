import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  Sparkles,
  History,
  Building2,
  Users,
  UserCheck,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { notify } from '../../components/ui/kit';
import { apiUrl } from '../../lib/config';
import { MADAR_PLANS, getPlanConfig, type PlanId } from '../../../shared/constants/plans';
import { UsageMeter, type UsageData } from '../dashboard/UsageMeter';

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
};

export function BillingPage() {
  const { t, i18n } = useTranslation();
  const isArabic = i18n.language === 'ar';
  const { user } = useAuth();
  const [tenant, setTenant] = useState<TenantDetails | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [trialDaysRemaining, setTrialDaysRemaining] = useState<number>(0);
  const [isTrialActive, setIsTrialActive] = useState<boolean>(false);
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlan, setSelectedPlan] = useState<PlanId>('GROWTH');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'VODAFONE_CASH' | 'INSTAPAY' | 'CASH'>('VODAFONE_CASH');
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
          usage: UsageData | null;
          subscriptions: SubscriptionItem[];
        };
      };
      if (json.data) {
        setTenant(json.data.tenant);
        setTrialDaysRemaining(json.data.trialDaysRemaining);
        setIsTrialActive(json.data.isTrialActive);
        setUsage(json.data.usage);
        setSubscriptions(json.data.subscriptions);
      }
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSubscriptionDetails();
  }, []);

  const handleUpgradeSubmit = async () => {
    setIsUpgrading(true);
    try {
      const res = await fetch(apiUrl('/api/subscriptions/upgrade'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          plan: selectedPlan,
          paymentMethod: selectedPaymentMethod,
          paymentReference: paymentReference.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || 'فشلت عملية الترقية');
      notify(isArabic ? 'تم تفعيل باقة الاشتراك بنجاح! ✓' : 'Plan upgraded successfully! ✓', 'success');
      setShowPaymentModal(false);
      void fetchSubscriptionDetails();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الترقية';
      notify(msg, 'error');
    } finally {
      setIsUpgrading(false);
    }
  };

  const currentPlanRaw = tenant?.plan || user?.tenant?.plan || 'BASIC';
  const currentPlanConfig = getPlanConfig(currentPlanRaw);
  const planList = Object.values(MADAR_PLANS);
  const selectedPlanConfig = getPlanConfig(selectedPlan);

  if (loading) {
    return (
      <div className="page" dir="rtl" style={{ padding: 48, textAlign: 'center' }}>
        <p style={{ color: '#6b7280' }}>جاري تحميل بيانات الاشتراك والفوترة...</p>
      </div>
    );
  }

  return (
    <div className="page" dir="rtl">
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <h1 className="page-title">إدارة الاشتراك وباقات مدار</h1>
          <p className="page-sub">
            اختر الباقة المناسبة لحجم ونشاط سنترك. جميع الباقات تتضمن النظام التشغيلي الكامل لمدار.
          </p>
        </div>
      </div>

      {/* Trial Alert Banner */}
      {isTrialActive && (
        <div
          style={{
            background: '#e8f5ef',
            border: '1px solid #c9e8db',
            borderRadius: 16,
            padding: 20,
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                background: '#0e7c56',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
              }}
            >
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
            className="btn btn--primary"
            onClick={() => {
              setSelectedPlan('GROWTH');
              setShowPaymentModal(true);
            }}
          >
            تفعيل الاشتراك الدائم
          </button>
        </div>
      )}

      {/* Current Plan Overview with Real-Time Usage */}
      {usage && (
        <div style={{ marginBottom: 32 }}>
          <UsageMeter
            usage={usage}
            onNavigateToBilling={() => {
              const target = document.getElementById('plans-grid');
              target?.scrollIntoView({ behavior: 'smooth' });
            }}
          />
        </div>
      )}

      {/* ── 4 Main Pricing Plan Cards ───────────────────────────────────── */}
      <div id="plans-grid" style={{ marginBottom: 36 }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#111827' }}>
            باقات مدار للاشتراك الشهري
          </h2>
          <p style={{ fontSize: 14, color: '#6b7280', marginTop: 4 }}>
            الأسعار واضحة بالجنيه المصري، وبدون أي رسوم خفية.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 20,
            alignItems: 'stretch',
          }}
        >
          {planList.map((p) => {
            const isCurrent = currentPlanConfig.id === p.id && !isTrialActive;
            const isFeatured = p.isPopular;

            return (
              <div
                key={p.id}
                style={{
                  background: isFeatured ? '#043128' : '#fff',
                  color: isFeatured ? '#fff' : '#111827',
                  border: isCurrent
                    ? '2px solid #0e7c56'
                    : isFeatured
                    ? '2px solid #0e7c56'
                    : '1px solid #e5e7eb',
                  borderRadius: 20,
                  padding: 24,
                  display: 'flex',
                  flexDirection: 'column',
                  position: 'relative',
                  boxShadow: isFeatured
                    ? '0 16px 36px -12px rgba(4, 49, 40, 0.45)'
                    : '0 2px 10px rgba(0,0,0,0.03)',
                  transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                }}
              >
                {p.badgeAr && (
                  <span
                    style={{
                      position: 'absolute',
                      top: 16,
                      left: 16,
                      background: isFeatured ? '#f59e0b' : '#e8f5ef',
                      color: isFeatured ? '#3b2400' : '#0e7c56',
                      fontSize: 11,
                      fontWeight: 800,
                      padding: '4px 10px',
                      borderRadius: 99,
                    }}
                  >
                    {p.badgeAr}
                  </span>
                )}

                <div style={{ marginBottom: 12 }}>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: isFeatured ? '#fff' : '#111827' }}>
                    {p.name}
                  </h3>
                  <p
                    style={{
                      fontSize: 13,
                      color: isFeatured ? '#a3d9c1' : '#6b7280',
                      marginTop: 4,
                      minHeight: 38,
                    }}
                  >
                    {p.positioningAr}
                  </p>
                </div>

                <div style={{ margin: '14px 0 20px' }}>
                  <span style={{ fontSize: 34, fontWeight: 900 }}>
                    {p.priceEgp.toLocaleString('ar-EG')}
                  </span>
                  <span style={{ fontSize: 13, color: isFeatured ? '#a3d9c1' : '#6b7280', marginInlineStart: 6 }}>
                    جنيه / شهرياً
                  </span>
                </div>

                {/* Primary capacity differentiators */}
                <div
                  style={{
                    background: isFeatured ? 'rgba(255,255,255,0.08)' : '#f9fafb',
                    padding: '12px 14px',
                    borderRadius: 12,
                    marginBottom: 20,
                    fontSize: 13,
                    display: 'grid',
                    gap: 8,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Users className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>
                      <strong>{p.monthlyVisitLimit.toLocaleString('ar-EG')}</strong> زيارة شهرياً
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <UserCheck className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>
                      {p.maxReceptionists === null ? (
                        <strong>حسابات استقبال غير محدودة</strong>
                      ) : (
                        <><strong>{p.maxReceptionists}</strong> حساب استقبال</>
                      )}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                    <span>
                      {p.maxBranches === null ? (
                        <strong>فروع متعددة</strong>
                      ) : (
                        <><strong>فرع واحد</strong></>
                      )}
                    </span>
                  </div>
                </div>

                {/* Feature Bullet List */}
                <ul
                  style={{
                    display: 'grid',
                    gap: 10,
                    marginBottom: 24,
                    flex: 1,
                    fontSize: 13,
                    listStyle: 'none',
                    padding: 0,
                  }}
                >
                  {p.featuresAr.map((feat, idx) => (
                    <li key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Check className={`h-4 w-4 ${isFeatured ? 'text-emerald-400' : 'text-emerald-600'} flex-shrink-0`} />
                      <span style={{ color: isFeatured ? '#e5e7eb' : '#374151' }}>{feat}</span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className={`btn ${isFeatured ? 'btn--primary' : isCurrent ? 'btn--soft' : 'btn--secondary'}`}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontWeight: 800,
                    ...(isFeatured
                      ? { background: '#fff', color: '#043128', border: 'none' }
                      : {}),
                  }}
                  disabled={isCurrent}
                  onClick={() => {
                    setSelectedPlan(p.id as PlanId);
                    setShowPaymentModal(true);
                  }}
                >
                  {isCurrent ? 'باقتك الحالية' : `الاشتراك في ${p.name}`}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Detailed Plan Comparison Table ──────────────────────────────── */}
      <div className="card" style={{ padding: 28, marginBottom: 36, borderRadius: 20 }}>
        <h3 style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>
          مقارنة تفصيلية بين باقات مدار
        </h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
          جميع الباقات تتضمن الأساسيات التشغيلية، والترقية تمنحك سعة واستقبال وفروع أكبر.
        </p>

        <div className="table-wrap">
          <table className="table" style={{ fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb' }}>
                <th style={{ width: '32%' }}>الميزة / الإمكانية</th>
                {planList.map((p) => (
                  <th key={p.id} style={{ textAlign: 'center', fontWeight: 800 }}>
                    {p.name}
                    <div style={{ fontSize: 11, fontWeight: 400, color: '#6b7280' }}>
                      {p.priceEgp} ج.م / شهر
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Category: Operations */}
              <tr style={{ background: '#f3f4f6', fontWeight: 800 }}>
                <td colSpan={5} style={{ color: '#111827' }}>
                  ⚙️ {t('plans.categories.operations')}
                </td>
              </tr>
              <tr>
                <td>إدارة الطلاب والمدرسين والحصص</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <Check className="h-4 w-4 text-emerald-600 inline" />
                  </td>
                ))}
              </tr>
              <tr>
                <td>الاستقبال السريع وتسجيل الحضور (Lobby)</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <Check className="h-4 w-4 text-emerald-600 inline" />
                  </td>
                ))}
              </tr>
              <tr>
                <td>خزينة الوردية وتصفية المدرسين</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <Check className="h-4 w-4 text-emerald-600 inline" />
                  </td>
                ))}
              </tr>
              <tr>
                <td>طرق الدفع (كاش، فودافون كاش، إنستاباي)</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <Check className="h-4 w-4 text-emerald-600 inline" />
                  </td>
                ))}
              </tr>

              {/* Category: Capacity & Usage */}
              <tr style={{ background: '#f3f4f6', fontWeight: 800 }}>
                <td colSpan={5} style={{ color: '#111827' }}>
                  📊 {t('plans.categories.capacity')}
                </td>
              </tr>
              <tr>
                <td>الحد الأقصى لزيارات الطلاب شهرياً</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {p.featureBreakdown.capacity.monthlyVisits}
                  </td>
                ))}
              </tr>
              <tr>
                <td>عدد حسابات الاستقبال المتزامنة</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {p.featureBreakdown.capacity.receptionists}
                  </td>
                ))}
              </tr>
              <tr>
                <td>عدد الفروع المسموحة</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center', fontWeight: 700 }}>
                    {p.featureBreakdown.capacity.branches}
                  </td>
                ))}
              </tr>

              {/* Category: Management */}
              <tr style={{ background: '#f3f4f6', fontWeight: 800 }}>
                <td colSpan={5} style={{ color: '#111827' }}>
                  📈 {t('plans.categories.management')}
                </td>
              </tr>
              <tr>
                <td>التقارير اليومية والمالية</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    <Check className="h-4 w-4 text-emerald-600 inline" />
                  </td>
                ))}
              </tr>
              <tr>
                <td>التقارير المتقدمة وتصدير البيانات</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    {p.featureBreakdown.management.advancedReports ? (
                      <Check className="h-4 w-4 text-emerald-600 inline" />
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>إدارة صلاحيات الموظفين</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    {p.featureBreakdown.management.permissions}
                  </td>
                ))}
              </tr>

              {/* Category: Multi-Branch */}
              <tr style={{ background: '#f3f4f6', fontWeight: 800 }}>
                <td colSpan={5} style={{ color: '#111827' }}>
                  🏢 {t('plans.categories.multiBranch')}
                </td>
              </tr>
              <tr>
                <td>إدارة فروع متعددة في حساب واحد</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    {p.featureBreakdown.multiBranch.multiBranchSupport ? (
                      <Check className="h-4 w-4 text-emerald-600 inline" />
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td>لوحة قيادة مركزية وتقارير الفروع</td>
                {planList.map((p) => (
                  <td key={p.id} style={{ textAlign: 'center' }}>
                    {p.featureBreakdown.multiBranch.centralDashboard ? (
                      <Check className="h-4 w-4 text-emerald-600 inline" />
                    ) : (
                      <span style={{ color: '#9ca3af' }}>—</span>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Subscription Invoices History */}
      <div className="card" style={{ padding: 24, borderRadius: 20 }}>
        <h3 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
          <History className="h-5 w-5 text-emerald-700" /> سجل مدفوعات وفواتير الاشتراك
        </h3>

        {subscriptions.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: 13 }}>
            لا توجد مدفوعات سابقة حتى الآن (السنتر في فترة التجربة المجانية).
          </p>
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
                {subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td>{new Date(sub.createdAt).toLocaleDateString('ar-EG')}</td>
                    <td><b>{sub.plan}</b></td>
                    <td>{sub.amount} ج.م</td>
                    <td>
                      {sub.paymentMethod === 'VODAFONE_CASH'
                        ? 'فودافون كاش'
                        : sub.paymentMethod === 'INSTAPAY'
                        ? 'إنستاباي'
                        : 'كاش'}
                    </td>
                    <td><code style={{ fontSize: 11 }}>{sub.paymentReference}</code></td>
                    <td><span className="badge badge--ok">مفعل</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment / Upgrade Modal */}
      {showPaymentModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 100,
            padding: 16,
          }}
          onClick={() => setShowPaymentModal(false)}
        >
          <div
            className="card"
            style={{ maxWidth: 480, width: '100%', padding: 24, borderRadius: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
              تأكيد تفعيل باقة {selectedPlanConfig.name}
            </h3>
            <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 18 }}>
              المبلغ المطلوب: <b>{selectedPlanConfig.priceEgp.toLocaleString('ar-EG')} ج.م / شهر</b> ({selectedPlanConfig.positioningAr})
            </p>

            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <label className="field-label" style={{ display: 'block', marginBottom: 6 }}>
                  طريقة الدفع (مصر):
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'VODAFONE_CASH' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('VODAFONE_CASH')}
                  >
                    فودافون كاش
                  </button>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'INSTAPAY' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('INSTAPAY')}
                  >
                    إنستاباي
                  </button>
                  <button
                    type="button"
                    className={`btn ${selectedPaymentMethod === 'CASH' ? 'btn--primary' : 'btn--ghost'}`}
                    style={{ fontSize: 12, padding: 8 }}
                    onClick={() => setSelectedPaymentMethod('CASH')}
                  >
                    فيزا / كارت
                  </button>
                </div>
              </div>

              {selectedPaymentMethod === 'VODAFONE_CASH' && (
                <div style={{ background: '#f5f7f6', padding: 12, borderRadius: 10, fontSize: 12 }}>
                  <p>يرجى تحويل المبلغ لمحفظة فودافون كاش رقم: <b>01012345678</b></p>
                  <p style={{ color: '#6b7280', marginTop: 4 }}>ثم اكتب رقم المحفظة المحول منها بالأسفل:</p>
                </div>
              )}

              {selectedPaymentMethod === 'INSTAPAY' && (
                <div style={{ background: '#f5f7f6', padding: 12, borderRadius: 10, fontSize: 12 }}>
                  <p>يرجى التحويل على عنوان إنستاباي: <b>madar@instapay</b></p>
                  <p style={{ color: '#6b7280', marginTop: 4 }}>ثم اكتب اسم الحساب أو رقم المرجع بالأسفل:</p>
                </div>
              )}

              <label className="field">
                <span className="field-label">رقم المرجع / رقم التحويل (اختياري)</span>
                <input
                  className="input"
                  placeholder="مثال: TRX-998822"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
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
