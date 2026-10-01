import { useState, type FormEvent } from 'react';
import { Building2, UserRound, Phone, KeyRound, ArrowRight, ArrowLeft, Check, Sparkles, ExternalLink } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';
import { InstapayQr } from '../components/ui/InstapayQr';
import { EGYPTIAN_MOBILE_REGEX } from '../../shared/constants/index';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY } from '../../shared/constants/subscription';
import { MADAR_OFFER } from '../../shared/constants/offers';
import { billingConfig } from '../lib/billingConfig';

const INSTAPAY_ACCOUNT_REGEX = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;

interface SignupPageProps {
  onNavigateLogin?: () => void;
  onNavigateLanding?: () => void;
}

export function SignupPage({ onNavigateLogin, onNavigateLanding }: SignupPageProps) {
  const { registerCenter } = useAuth();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [centerName, setCenterName] = useState('');

  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [paymentReference, setPaymentReference] = useState('');

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const instapayAccount = billingConfig.paymentAccounts.INSTAPAY;
  const instapayLink = 'paymentLink' in instapayAccount && instapayAccount.paymentLink ? instapayAccount.paymentLink : null;

  const validateStep1 = () => {
    setError('');
    if (!centerName.trim() || centerName.trim().length < 2) {
      setError('يرجى إدخال اسم السنتر (حرفين على الأقل).');
      return false;
    }
    return true;
  };

  const handleNextStep = (e: FormEvent) => {
    e.preventDefault();
    if (validateStep1()) {
      setStep(2);
    }
  };

  const validateOwnerDetails = () => {
    setError('');
    if (!ownerName.trim() || ownerName.trim().length < 2) {
      setError('يرجى إدخال اسم مدير أو مالك السنتر.');
      return false;
    }
    if (!EGYPTIAN_MOBILE_REGEX.test(ownerPhone.trim())) {
      setError('يرجى إدخال رقم هاتف مصري صحيح يبدأ بـ (010, 011, 012, 015).');
      return false;
    }
    if (!username.trim() || username.trim().length < 3) {
      setError('اسم الدخول يجب أن يكون 3 أحرف على الأقل بالإنجليزية أو أرقام.');
      return false;
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن تكون 8 خانات على الأقل.');
      return false;
    }
    return true;
  };

  const handleNextToPayment = (e: FormEvent) => {
    e.preventDefault();
    if (validateOwnerDetails()) {
      setStep(3);
    }
  };

  const handleFinalSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateOwnerDetails()) return;

    if (!paymentReference.trim()) {
      setError('يرجى إدخال اسم حسابك في إنستاباي (الذي دفعت منه) لإثبات الدفع.');
      return;
    }
    if (!INSTAPAY_ACCOUNT_REGEX.test(paymentReference.trim())) {
      setError('صيغة اسم إنستاباي غير صحيحة — أدخله مثلًا على هذا الشكل: name@instapay');
      return;
    }

    setSubmitting(true);
    try {
      await registerCenter({
        centerName: centerName.trim(),
        ownerName: ownerName.trim(),
        ownerPhone: ownerPhone.trim(),
        username: username.trim().toLowerCase(),
        password,
        paymentReference: paymentReference.trim(),
      });
      // AuthProvider automatically sets user and redirects to AppShell
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'فشل إنشاء السنتر، يرجى المحاولة مرة أخرى.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
     <main className="login-bg" dir="rtl">
       <div className="login-card" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div className="login-logo" style={{ cursor: 'pointer', margin: 0 }} onClick={onNavigateLanding}>
            م
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f5ef', color: '#0e7c56', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }}>
            <Sparkles className="h-3.5 w-3.5" /> الدفع عبر إنستاباي
          </span>
        </div>

        <h1 className="login-title" style={{ fontSize: 22, marginTop: 4 }}>
          {step === 1 ? 'إنشاء حساب سنتر تعليمي جديد' : step === 2 ? 'بيانات مدير السنتر والحساب' : 'دفع الاشتراك وبدء التشغيل'}
        </h1>
        <p className="login-sub">
          {step === 1
            ? 'خطوة 1 من 3: أدخل اسم سنترك واختر باقتك'
            : step === 2
              ? 'خطوة 2 من 3: أنشئ حساب الدخول الرئيسي لإدارة السنتر'
              : 'خطوة 3 من 3: ادفع اشتراك الباقة عبر إنستاباي لتفعيل حسابك'}
        </p>

        {/* Step Progress Bar */}
        <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px' }}>
          <div style={{ height: 4, flex: 1, borderRadius: 99, background: '#0e7c56' }} />
          <div style={{ height: 4, flex: 1, borderRadius: 99, background: step >= 2 ? '#0e7c56' : '#e2e0dc' }} />
          <div style={{ height: 4, flex: 1, borderRadius: 99, background: step >= 3 ? '#0e7c56' : '#e2e0dc' }} />
        </div>

        <Banner text={error} tone="error" />

        {step === 1 && (
          <form onSubmit={handleNextStep} className="form-stack">
            <label className="field">
              <span className="field-label">اسم السنتر / المركز التعليمي *</span>
              <div className="searchbar">
                <Building2 className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="مثال: سنتر الأوائل التعليمي"
                  required
                  value={centerName}
                  onChange={(e) => setCenterName(e.target.value)}
                />
              </div>
            </label>

            <div style={{ marginTop: 8 }}>
              <span className="field-label" style={{ display: 'block', marginBottom: 8 }}>
                باقتك — يُفعَّل اشتراكك بعد تأكيد دفعة إنستاباي
              </span>

              <div style={{ border: '2px solid #0e7c56', background: '#f0faf5', borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <b style={{ fontSize: 15 }}>{MADAR_OFFER.nameAr}</b>
                  <Check className="h-4 w-4 text-emerald-700" />
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0e7c56', margin: '4px 0' }}>
                  {MONTHLY_PRICE_EGP} {SUBSCRIPTION_CURRENCY}/شهر
                </div>
                <small style={{ fontSize: 10, color: '#6b7280' }}>{MADAR_OFFER.taglineAr}</small>
              </div>
            </div>

            <button type="submit" className="btn btn--primary" style={{ width: '100%', paddingBlock: 12, marginTop: 12 }}>
              المتابعة لبيانات الحساب <ArrowLeft className="h-4 w-4" />
            </button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={handleNextToPayment} className="form-stack">
            <label className="field">
              <span className="field-label">اسم المدير / المالك *</span>
              <div className="searchbar">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="مثال: أ/ محمود الشريف"
                  required
                  value={ownerName}
                  onChange={(e) => setOwnerName(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">رقم الهاتف (موبايل مصري) *</span>
              <div className="searchbar">
                <Phone className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  type="tel"
                  placeholder="01012345678"
                  required
                  value={ownerPhone}
                  onChange={(e) => setOwnerPhone(e.target.value)}
                />
              </div>
            </label>

            <label className="field">
              <span className="field-label">اسم الدخول (إنجليزي — فريد لكل حساب) *</span>
              <div className="searchbar">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  placeholder="admin_center"
                  required
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              <small style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>هذا الاسم هو ما تستخدمه لتسجيل الدخول، ويجب أن يكون غير مستخدم من قبل في أي حساب آخر.</small>
            </label>

            <label className="field">
              <span className="field-label">كلمة المرور (8 خانات على الأقل) *</span>
              <div className="searchbar">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="btn btn--secondary"
                style={{ flex: 1, paddingBlock: 12 }}
                disabled={submitting}
              >
                <ArrowRight className="h-4 w-4" /> السابق
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                style={{ flex: 2, paddingBlock: 12 }}
              >
                المتابعة للدفع والتفعيل <ArrowLeft className="h-4 w-4" />
              </button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={handleFinalSubmit} className="form-stack">
            <div style={{ background: '#f0faf5', border: '1px solid #c9e8db', borderRadius: 14, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <b style={{ fontSize: 15 }}>باقة {MADAR_OFFER.nameAr}</b>
                <span style={{ fontWeight: 800, color: '#0e7c56', fontSize: 15 }}>{MONTHLY_PRICE_EGP} {SUBSCRIPTION_CURRENCY} / شهر</span>
              </div>
              <p style={{ fontSize: 12, color: '#0b6a4a', margin: 0 }}>
                ادفع مبلغ الاشتراك عبر إنستاباي بإحدى الطريقتين، ثم أدخل اسم حسابك لإثبات الدفع.
              </p>
            </div>

            <div style={{ background: '#fff', border: '1px solid #e2e0dc', borderRadius: 14, padding: 16, display: 'grid', gap: 10 }}>
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
              <div className="searchbar">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                <input
                  className="input"
                  dir="ltr"
                  style={{ textAlign: 'start' }}
                  placeholder="name@instapay"
                  required
                  autoComplete="off"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>
              <small style={{ fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }}>
                أدخل اسم حساب إنستاباي الذي دفعت منه بالضبط — مثل: name@instapay
              </small>
            </label>

            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn btn--secondary"
                style={{ flex: 1, paddingBlock: 12 }}
                disabled={submitting}
              >
                <ArrowRight className="h-4 w-4" /> السابق
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                style={{ flex: 2, paddingBlock: 12 }}
                disabled={submitting}
              >
                {submitting ? 'جاري إنشاء السنتر وتفعيل الاشتراك...' : 'تأكيد الدفع وإنشاء السنتر'}
              </button>
            </div>
          </form>
        )}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }}>
          {onNavigateLanding && (
            <button type="button" onClick={onNavigateLanding} className="btn-link" style={{ color: 'var(--text-secondary)' }}>
              ← العودة للرئيسية
            </button>
          )}
          {onNavigateLogin && (
            <button type="button" onClick={onNavigateLogin} className="btn-link" style={{ color: 'var(--primary)', fontWeight: 700 }}>
              لديك حساب بالفعل؟ تسجيل الدخول
            </button>
          )}
        </div>
      </div>
    </main>
  );
}