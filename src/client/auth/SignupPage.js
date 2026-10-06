import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { Building2, UserRound, Phone, KeyRound, ArrowRight, ArrowLeft, Check, Sparkles, ExternalLink } from 'lucide-react';
import { useAuth } from './AuthContext';
import { Banner } from '../components/ui/kit';
import { InstapayQr } from '../components/ui/InstapayQr';
import { EGYPTIAN_MOBILE_REGEX } from '../../shared/constants/index';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY } from '../../shared/constants/subscription';
import { MADAR_OFFER } from '../../shared/constants/offers';
import { billingConfig } from '../lib/billingConfig';
const INSTAPAY_ACCOUNT_REGEX = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;
export function SignupPage({ onNavigateLogin, onNavigateLanding }) {
    const { registerCenter } = useAuth();
    const [step, setStep] = useState(1);
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
    const handleNextStep = (e) => {
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
    const handleNextToPayment = (e) => {
        e.preventDefault();
        if (validateOwnerDetails()) {
            setStep(3);
        }
    };
    const handleFinalSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!validateOwnerDetails())
            return;
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
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'فشل إنشاء السنتر، يرجى المحاولة مرة أخرى.';
            setError(msg);
        }
        finally {
            setSubmitting(false);
        }
    };
    return (_jsx("main", { className: "login-bg", dir: "rtl", children: _jsxs("div", { className: "login-card", style: { maxWidth: 480 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }, children: [_jsx("div", { className: "login-logo", style: { cursor: 'pointer', margin: 0 }, onClick: onNavigateLanding, children: "\u0645" }), _jsxs("span", { style: { display: 'inline-flex', alignItems: 'center', gap: 6, background: '#e8f5ef', color: '#0e7c56', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700 }, children: [_jsx(Sparkles, { className: "h-3.5 w-3.5" }), " \u0627\u0644\u062F\u0641\u0639 \u0639\u0628\u0631 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A"] })] }), _jsx("h1", { className: "login-title", style: { fontSize: 22, marginTop: 4 }, children: step === 1 ? 'إنشاء حساب سنتر تعليمي جديد' : step === 2 ? 'بيانات مدير السنتر والحساب' : 'دفع الاشتراك وبدء التشغيل' }), _jsx("p", { className: "login-sub", children: step === 1
                        ? 'خطوة 1 من 3: أدخل اسم سنترك واختر باقتك'
                        : step === 2
                            ? 'خطوة 2 من 3: أنشئ حساب الدخول الرئيسي لإدارة السنتر'
                            : 'خطوة 3 من 3: ادفع اشتراك الباقة عبر إنستاباي لتفعيل حسابك' }), _jsxs("div", { style: { display: 'flex', gap: 6, margin: '14px 0 20px' }, children: [_jsx("div", { style: { height: 4, flex: 1, borderRadius: 99, background: '#0e7c56' } }), _jsx("div", { style: { height: 4, flex: 1, borderRadius: 99, background: step >= 2 ? '#0e7c56' : '#e2e0dc' } }), _jsx("div", { style: { height: 4, flex: 1, borderRadius: 99, background: step >= 3 ? '#0e7c56' : '#e2e0dc' } })] }), _jsx(Banner, { text: error, tone: "error" }), step === 1 && (_jsxs("form", { onSubmit: handleNextStep, className: "form-stack", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0627\u0633\u0645 \u0627\u0644\u0633\u0646\u062A\u0631 / \u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A *" }), _jsxs("div", { className: "searchbar", children: [_jsx(Building2, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", placeholder: "\u0645\u062B\u0627\u0644: \u0633\u0646\u062A\u0631 \u0627\u0644\u0623\u0648\u0627\u0626\u0644 \u0627\u0644\u062A\u0639\u0644\u064A\u0645\u064A", required: true, value: centerName, onChange: (e) => setCenterName(e.target.value) })] })] }), _jsxs("div", { style: { marginTop: 8 }, children: [_jsx("span", { className: "field-label", style: { display: 'block', marginBottom: 8 }, children: "\u0628\u0627\u0642\u062A\u0643 \u2014 \u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0628\u0639\u062F \u062A\u0623\u0643\u064A\u062F \u062F\u0641\u0639\u0629 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A" }), _jsxs("div", { style: { border: '2px solid #0e7c56', background: '#f0faf5', borderRadius: 12, padding: 12 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }, children: [_jsx("b", { style: { fontSize: 15 }, children: MADAR_OFFER.nameAr }), _jsx(Check, { className: "h-4 w-4 text-emerald-700" })] }), _jsxs("div", { style: { fontSize: 13, fontWeight: 800, color: '#0e7c56', margin: '4px 0' }, children: [MONTHLY_PRICE_EGP, " ", SUBSCRIPTION_CURRENCY, "/\u0634\u0647\u0631"] }), _jsx("small", { style: { fontSize: 10, color: '#6b7280' }, children: MADAR_OFFER.taglineAr })] })] }), _jsxs("button", { type: "submit", className: "btn btn--primary", style: { width: '100%', paddingBlock: 12, marginTop: 12 }, children: ["\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628 ", _jsx(ArrowLeft, { className: "h-4 w-4" })] })] })), step === 2 && (_jsxs("form", { onSubmit: handleNextToPayment, className: "form-stack", children: [_jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0627\u0633\u0645 \u0627\u0644\u0645\u062F\u064A\u0631 / \u0627\u0644\u0645\u0627\u0644\u0643 *" }), _jsxs("div", { className: "searchbar", children: [_jsx(UserRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", placeholder: "\u0645\u062B\u0627\u0644: \u0623/ \u0645\u062D\u0645\u0648\u062F \u0627\u0644\u0634\u0631\u064A\u0641", required: true, value: ownerName, onChange: (e) => setOwnerName(e.target.value) })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0631\u0642\u0645 \u0627\u0644\u0647\u0627\u062A\u0641 (\u0645\u0648\u0628\u0627\u064A\u0644 \u0645\u0635\u0631\u064A) *" }), _jsxs("div", { className: "searchbar", children: [_jsx(Phone, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", type: "tel", placeholder: "01012345678", required: true, value: ownerPhone, onChange: (e) => setOwnerPhone(e.target.value) })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0627\u0633\u0645 \u0627\u0644\u062F\u062E\u0648\u0644 (\u0625\u0646\u062C\u0644\u064A\u0632\u064A \u2014 \u0641\u0631\u064A\u062F \u0644\u0643\u0644 \u062D\u0633\u0627\u0628) *" }), _jsxs("div", { className: "searchbar", children: [_jsx(UserRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", placeholder: "admin_center", required: true, autoComplete: "username", value: username, onChange: (e) => setUsername(e.target.value) })] }), _jsx("small", { style: { fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }, children: "\u0647\u0630\u0627 \u0627\u0644\u0627\u0633\u0645 \u0647\u0648 \u0645\u0627 \u062A\u0633\u062A\u062E\u062F\u0645\u0647 \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644\u060C \u0648\u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u063A\u064A\u0631 \u0645\u0633\u062A\u062E\u062F\u0645 \u0645\u0646 \u0642\u0628\u0644 \u0641\u064A \u0623\u064A \u062D\u0633\u0627\u0628 \u0622\u062E\u0631." })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 (8 \u062E\u0627\u0646\u0627\u062A \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644) *" }), _jsxs("div", { className: "searchbar", children: [_jsx(KeyRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", type: "password", required: true, autoComplete: "new-password", value: password, onChange: (e) => setPassword(e.target.value) })] })] }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }, children: [_jsxs("button", { type: "button", onClick: () => setStep(1), className: "btn btn--secondary", style: { flex: 1, paddingBlock: 12 }, disabled: submitting, children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0627\u0644\u0633\u0627\u0628\u0642"] }), _jsxs("button", { type: "submit", className: "btn btn--primary", style: { flex: 2, paddingBlock: 12 }, children: ["\u0627\u0644\u0645\u062A\u0627\u0628\u0639\u0629 \u0644\u0644\u062F\u0641\u0639 \u0648\u0627\u0644\u062A\u0641\u0639\u064A\u0644 ", _jsx(ArrowLeft, { className: "h-4 w-4" })] })] })] })), step === 3 && (_jsxs("form", { onSubmit: handleFinalSubmit, className: "form-stack", children: [_jsxs("div", { style: { background: '#f0faf5', border: '1px solid #c9e8db', borderRadius: 14, padding: 16 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }, children: [_jsxs("b", { style: { fontSize: 15 }, children: ["\u0628\u0627\u0642\u0629 ", MADAR_OFFER.nameAr] }), _jsxs("span", { style: { fontWeight: 800, color: '#0e7c56', fontSize: 15 }, children: [MONTHLY_PRICE_EGP, " ", SUBSCRIPTION_CURRENCY, " / \u0634\u0647\u0631"] })] }), _jsx("p", { style: { fontSize: 12, color: '#0b6a4a', margin: 0 }, children: "\u0627\u062F\u0641\u0639 \u0645\u0628\u0644\u063A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0639\u0628\u0631 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A \u0628\u0625\u062D\u062F\u0649 \u0627\u0644\u0637\u0631\u064A\u0642\u062A\u064A\u0646\u060C \u062B\u0645 \u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u062D\u0633\u0627\u0628\u0643 \u0644\u0625\u062B\u0628\u0627\u062A \u0627\u0644\u062F\u0641\u0639." })] }), _jsxs("div", { style: { background: '#fff', border: '1px solid #e2e0dc', borderRadius: 14, padding: 16, display: 'grid', gap: 10 }, children: [_jsx(InstapayQr, {}), instapayLink && (_jsxs("a", { href: instapayLink, target: "_blank", rel: "noopener noreferrer", className: "btn btn--primary", style: { justifyContent: 'center', width: '100%', paddingBlock: 11 }, children: ["\u0627\u062F\u0641\u0639 \u0627\u0644\u0622\u0646 \u0639\u0628\u0631 \u0631\u0627\u0628\u0637 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A ", _jsx(ExternalLink, { className: "h-4 w-4" })] })), _jsxs("div", { style: { fontSize: 13, textAlign: 'center' }, children: [_jsx("span", { style: { color: '#6b7280' }, children: "\u0623\u0648 \u062D\u0648\u0651\u0644 \u0625\u0644\u0649 \u0627\u0644\u062D\u0633\u0627\u0628:" }), ' ', _jsx("b", { dir: "ltr", style: { color: '#0e7c56' }, children: instapayAccount.accountNumber })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0627\u0633\u0645 \u062D\u0633\u0627\u0628\u0643 \u0641\u064A \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A (\u0627\u0644\u0630\u064A \u062F\u0641\u0639\u062A \u0645\u0646\u0647) \u2014 \u0625\u062B\u0628\u0627\u062A \u0627\u0644\u062F\u0641\u0639 *" }), _jsxs("div", { className: "searchbar", children: [_jsx(UserRound, { className: "h-4 w-4", "aria-hidden": "true" }), _jsx("input", { className: "input", dir: "ltr", style: { textAlign: 'start' }, placeholder: "name@instapay", required: true, autoComplete: "off", value: paymentReference, onChange: (e) => setPaymentReference(e.target.value) })] }), _jsx("small", { style: { fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }, children: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u062D\u0633\u0627\u0628 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A \u0627\u0644\u0630\u064A \u062F\u0641\u0639\u062A \u0645\u0646\u0647 \u0628\u0627\u0644\u0636\u0628\u0637 \u2014 \u0645\u062B\u0644: name@instapay" })] }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }, children: [_jsxs("button", { type: "button", onClick: () => setStep(2), className: "btn btn--secondary", style: { flex: 1, paddingBlock: 12 }, disabled: submitting, children: [_jsx(ArrowRight, { className: "h-4 w-4" }), " \u0627\u0644\u0633\u0627\u0628\u0642"] }), _jsx("button", { type: "submit", className: "btn btn--primary", style: { flex: 2, paddingBlock: 12 }, disabled: submitting, children: submitting ? 'جاري إنشاء السنتر وتفعيل الاشتراك...' : 'تأكيد الدفع وإنشاء السنتر' })] })] })), _jsxs("div", { style: { marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }, children: [onNavigateLanding && (_jsx("button", { type: "button", onClick: onNavigateLanding, className: "btn-link", style: { color: 'var(--text-secondary)' }, children: "\u2190 \u0627\u0644\u0639\u0648\u062F\u0629 \u0644\u0644\u0631\u0626\u064A\u0633\u064A\u0629" })), onNavigateLogin && (_jsx("button", { type: "button", onClick: onNavigateLogin, className: "btn-link", style: { color: 'var(--primary)', fontWeight: 700 }, children: "\u0644\u062F\u064A\u0643 \u062D\u0633\u0627\u0628 \u0628\u0627\u0644\u0641\u0639\u0644\u061F \u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644" }))] })] }) }));
}
