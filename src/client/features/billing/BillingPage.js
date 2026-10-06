import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from 'react';
import { Check, Sparkles, History, ExternalLink, Clock, ShieldAlert, Snowflake } from 'lucide-react';
import { notify } from '../../components/ui/kit';
import { InstapayQr } from '../../components/ui/InstapayQr';
import { apiUrl } from '../../lib/config';
import { money } from '../../lib/api';
import { billingConfig } from '../../lib/billingConfig';
import { MADAR_OFFER, foundingDiscountPercent } from '../../../shared/constants/offers';
import { MONTHLY_PRICE_EGP, SUBSCRIPTION_CURRENCY, TRIAL_DAYS } from '../../../shared/constants/subscription';
const INSTAPAY_ACCOUNT_REGEX = /^[a-zA-Z0-9_.-]+@[a-zA-Z0-9_.-]+$/;
const STATUS_LABELS = {
    PENDING: { ar: 'قيد التأكيد', ok: false },
    ACTIVE: { ar: 'مفعل', ok: true },
    TRIALING: { ar: 'تجربة', ok: true },
    PAST_DUE: { ar: 'متأخر', ok: false },
    CANCELED: { ar: 'ملغي', ok: false },
    EXPIRED: { ar: 'منتهي', ok: false },
    REJECTED: { ar: 'مرفوض', ok: false },
};
const LIFECYCLE_BANNER = {
    EXPIRING: { bg: '#fffbeb', border: '#fde68a', color: '#78350f', icon: Clock },
    GRACE: { bg: '#fff7ed', border: '#fed7aa', color: '#9a3412', icon: ShieldAlert },
    FROZEN: { bg: '#fef2f2', border: '#fecaca', color: '#7f1d1d', icon: Snowflake },
    AWAITING_APPROVAL: { bg: '#eef2ff', border: '#c7d2fe', color: '#3730a3', icon: Clock },
};
export function BillingPage() {
    const [tenant, setTenant] = useState(null);
    const [trialDaysRemaining, setTrialDaysRemaining] = useState(0);
    const [isTrialActive, setIsTrialActive] = useState(false);
    const [lifecycle, setLifecycle] = useState(null);
    const [usage, setUsage] = useState(null);
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [paymentReference, setPaymentReference] = useState('');
    const [isRenewing, setIsRenewing] = useState(false);
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const fetchSubscriptionDetails = async () => {
        try {
            setLoading(true);
            const res = await fetch(apiUrl('/api/subscriptions/current'), { credentials: 'include' });
            const json = (await res.json());
            if (json.data) {
                setTenant(json.data.tenant);
                setTrialDaysRemaining(json.data.trialDaysRemaining);
                setIsTrialActive(json.data.isTrialActive);
                setLifecycle(json.data.lifecycle ?? null);
                setUsage(json.data.usage ?? null);
                setSubscriptions(json.data.subscriptions);
            }
        }
        catch {
            notify('تعذر تحميل بيانات الاشتراك', 'error');
        }
        finally {
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
            if (!res.ok)
                throw new Error(json.error?.message || json.error?.messageEn || 'فشلت عملية الدفع');
            notify('تم استلام طلب الدفع، وهو الآن قيد التأكيد من إدارة المنصة.', 'success');
            setShowPaymentModal(false);
            setPaymentReference('');
            void fetchSubscriptionDetails();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : 'حدث خطأ أثناء الدفع';
            notify(msg, 'error');
        }
        finally {
            setIsRenewing(false);
        }
    };
    if (loading) {
        return (_jsx("div", { className: "page", style: { padding: 32, textAlign: 'center' }, children: _jsx("p", { style: { color: '#6b7280' }, children: "\u062C\u0627\u0631\u064A \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0627\u0644\u0641\u0648\u062A\u0631\u0629..." }) }));
    }
    const instapayAccount = billingConfig.paymentAccounts.INSTAPAY;
    const instapayLink = 'paymentLink' in instapayAccount && instapayAccount.paymentLink ? instapayAccount.paymentLink : null;
    const pendingSubscription = subscriptions.find((sub) => sub.status === 'PENDING') ?? null;
    const discountPercent = foundingDiscountPercent(MADAR_OFFER);
    const lifecycleBanner = lifecycle ? LIFECYCLE_BANNER[lifecycle.state] : undefined;
    const needsPayment = !lifecycle || lifecycle.state === 'AWAITING_APPROVAL' || lifecycle.state === 'GRACE' || lifecycle.state === 'FROZEN' || lifecycle.state === 'EXPIRING';
    const isPaid = lifecycle?.state === 'ACTIVE' || lifecycle?.state === 'EXPIRING';
    return (_jsxs("div", { className: "page", children: [_jsx("div", { className: "page-head", children: _jsxs("div", { children: [_jsx("h1", { className: "page-title", children: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0627\u0644\u0641\u0648\u062A\u0631\u0629" }), _jsx("p", { className: "page-sub", children: "\u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0627\u062D\u062F \u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F\u060C \u0648\u0633\u062C\u0644 \u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0628\u0627\u0644\u062C\u0646\u064A\u0647 \u0627\u0644\u0645\u0635\u0631\u064A." })] }) }), pendingSubscription && (_jsxs("div", { style: { background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }, children: [_jsx("div", { style: { width: 44, height: 44, borderRadius: 12, background: '#f59e0b', color: '#3b2400', display: 'grid', placeItems: 'center', flexShrink: 0 }, children: _jsx(Clock, { className: "h-6 w-6" }) }), _jsxs("div", { style: { flex: 1, minWidth: 220 }, children: [_jsx("b", { style: { fontSize: 15 }, children: "\u062F\u0641\u0639\u062A\u0643 \u0642\u064A\u062F \u0627\u0644\u062A\u0623\u0643\u064A\u062F" }), _jsxs("p", { style: { fontSize: 13, color: '#78350f', margin: '2px 0 0' }, children: ["\u0645\u0628\u0644\u063A ", money(Number(pendingSubscription.amount)), " \u0639\u0628\u0631 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A (\u0627\u0644\u0645\u0631\u062C\u0639: ", _jsx("code", { dir: "ltr", children: pendingSubscription.paymentReference }), "). \u0644\u0646 \u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639 \u0648\u0644\u0627 \u064A\u062A\u063A\u064A\u0651\u0631 \u0645\u0627 \u064A\u0639\u0645\u0644 \u0641\u064A \u0627\u0644\u0645\u0631\u0643\u0632 \u0642\u0628\u0644 \u062A\u0623\u0643\u064A\u062F \u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u062F\u0641\u0639\u0629 \u064A\u062F\u0648\u064A\u064B\u0627."] })] }), _jsx("span", { style: { fontSize: 12, background: '#fff7ed', border: '1px solid #fed7aa', color: '#9a3412', borderRadius: 99, padding: '4px 12px', fontWeight: 700 }, children: "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u062A\u0623\u0643\u064A\u062F" })] })), lifecycleBanner && lifecycle?.reminder && (_jsxs("div", { style: { background: lifecycleBanner.bg, border: `1px solid ${lifecycleBanner.border}`, color: lifecycleBanner.color, borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }, children: [_jsx(lifecycleBanner.icon, { className: "h-6 w-6 shrink-0", "aria-hidden": "true" }), _jsx("p", { style: { fontSize: 14, margin: 0, flex: 1, minWidth: 220 }, children: lifecycle.reminder.messageAr }), needsPayment && (_jsx("button", { type: "button", className: "btn btn--primary", onClick: () => setShowPaymentModal(true), children: "\u0627\u062F\u0641\u0639 \u0627\u0644\u0622\u0646" }))] })), isTrialActive && (_jsxs("div", { className: "billing-banner", style: { background: '#e8f5ef', border: '1px solid #c9e8db', borderRadius: 14, padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 220 }, children: [_jsx("div", { style: { width: 44, height: 44, borderRadius: 12, background: '#0e7c56', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }, children: _jsx(Sparkles, { className: "h-6 w-6" }) }), _jsxs("div", { children: [_jsxs("b", { style: { fontSize: 16, color: '#043128' }, children: ["\u0623\u0646\u062A \u0627\u0644\u0622\u0646 \u0641\u064A \u0641\u062A\u0631\u0629 \u0627\u0644\u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0645\u062C\u0627\u0646\u064A\u0629 (", TRIAL_DAYS, " \u064A\u0648\u0645)"] }), _jsxs("p", { style: { fontSize: 13, color: '#0b6a4a', margin: '2px 0 0' }, children: ["\u0645\u062A\u0628\u0642\u064A ", trialDaysRemaining, " \u064A\u0648\u0645 \u0639\u0644\u0649 \u0627\u0646\u062A\u0647\u0627\u0621 \u0627\u0644\u062A\u062C\u0631\u0628\u0629. \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F: \u0644\u0627 \u064A\u0648\u062C\u062F \u062D\u062F \u0639\u0644\u0649 \u0639\u062F\u062F \u0627\u0644\u0637\u0644\u0627\u0628 \u0623\u0648 \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A \u0623\u0648 \u0627\u0644\u0641\u0631\u0648\u0639 \u0623\u0648 \u0645\u0648\u0638\u0641\u064A \u0627\u0644\u0627\u0633\u062A\u0642\u0628\u0627\u0644."] })] })] }), _jsx("button", { type: "button", className: "btn btn--primary cta-full", onClick: () => setShowPaymentModal(true), children: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643" })] })), _jsxs("div", { className: "card", style: { padding: 18, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }, children: [_jsx("div", { style: { width: 44, height: 44, borderRadius: 12, background: '#043128', color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }, children: _jsx(Sparkles, { className: "h-6 w-6" }) }), _jsxs("div", { style: { flex: 1, minWidth: 200 }, children: [_jsxs("b", { style: { fontSize: 16 }, children: ["\u0627\u0634\u062A\u0631\u0627\u0643 ", MADAR_OFFER.nameAr] }), _jsx("p", { style: { fontSize: 13, color: '#6b7280', margin: '2px 0 0' }, children: MADAR_OFFER.taglineAr })] }), _jsxs("div", { style: { fontSize: 13, textAlign: 'end' }, children: [_jsxs("b", { style: { display: 'block', fontSize: 18 }, children: [money(MONTHLY_PRICE_EGP), " / \u0634\u0647\u0631\u064A\u0627\u064B"] }), discountPercent !== null && (_jsx("s", { style: { color: '#6b7280' }, children: money(MADAR_OFFER.listPriceEgp) }))] }), _jsxs("div", { style: { width: '100%', fontSize: 13, color: '#6b7280' }, children: [tenant ? `مركزك: ${tenant.name} · ` : '', isPaid ? 'اشتراكك مدفوع وساري.' : isTrialActive ? 'التجربة المجانية سارية.' : 'لا يوجد اشتراك مدفوع ساري بعد.'] })] }), _jsx("div", { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 20, marginBottom: 32 }, children: _jsxs("div", { style: {
                        background: '#043128',
                        color: '#fff',
                        border: `2px solid ${isPaid ? '#0e7c56' : '#0e7c56'}`,
                        borderRadius: 18,
                        padding: 24,
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 12px 32px -8px rgba(4, 49, 40, 0.4)',
                    }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' }, children: [_jsx("h3", { style: { fontSize: 20, fontWeight: 800, color: '#fff' }, children: MADAR_OFFER.nameAr }), isPaid ? (_jsx("span", { style: { background: '#e8f5ef', color: '#0e7c56', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99 }, children: "\u0627\u0634\u062A\u0631\u0627\u0643\u0643 \u0627\u0644\u062D\u0627\u0644\u064A" })) : (_jsx("span", { style: { background: '#f59e0b', color: '#3b2400', fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99 }, children: MADAR_OFFER.highlightAr }))] }), _jsx("p", { style: { fontSize: 13, color: '#a3d9c1', minHeight: 40 }, children: MADAR_OFFER.taglineAr }), _jsxs("div", { style: { fontSize: 32, fontWeight: 800, margin: '14px 0', color: '#fff' }, children: [money(MADAR_OFFER.foundingPriceEgp), " ", _jsxs("span", { style: { fontSize: 14, color: '#a3d9c1' }, children: ["/ \u0634\u0647\u0631\u064A\u0627\u064B \u00B7 ", SUBSCRIPTION_CURRENCY] })] }), _jsx("ul", { style: { display: 'grid', gap: 10, margin: '14px 0 24px', flex: 1, fontSize: 13 }, children: MADAR_OFFER.featuresAr.map((feature) => (_jsxs("li", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(Check, { className: "h-4 w-4 shrink-0 text-emerald-400" }), " ", feature] }, feature))) }), _jsx("button", { type: "button", className: "btn btn--primary", style: { background: '#fff', color: '#043128', fontWeight: 800 }, onClick: () => setShowPaymentModal(true), children: isPaid ? 'تجديد الاشتراك' : 'الاشتراك الآن' })] }) }), usage && (_jsxs("div", { className: "card", style: { padding: 18, marginBottom: 24 }, children: [_jsx("h3", { style: { fontSize: 15, fontWeight: 800, marginBottom: 6 }, children: "\u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0643 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631" }), _jsxs("p", { style: { fontSize: 13, color: '#6b7280', margin: '0 0 10px' }, children: ["\u0639\u062F\u062F \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A \u0645\u0646\u0630 ", new Date(usage.periodStart).toLocaleDateString('ar-EG'), " \u2014 \u0645\u0639\u0644\u0648\u0645\u0629 \u0625\u0631\u0634\u0627\u062F\u064A\u0629 \u0641\u0642\u0637\u060C \u0648\u0644\u0627 \u064A\u0648\u062C\u062F \u062D\u062F \u064A\u0645\u0646\u0639 \u0627\u0644\u0639\u0645\u0644 \u0639\u0646\u062F \u062A\u062C\u0627\u0648\u0632\u0647\u0627."] }), _jsx("b", { style: { fontSize: 24 }, children: usage.usedVisits.toLocaleString('ar-EG') }), _jsx("span", { style: { fontSize: 13, color: '#6b7280' }, children: " \u0632\u064A\u0627\u0631\u0629" })] })), _jsxs("div", { className: "card", style: { padding: 20 }, children: [_jsxs("h3", { style: { fontSize: 17, fontWeight: 800, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(History, { className: "h-5 w-5 text-emerald-700" }), " \u0633\u062C\u0644 \u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643"] }), subscriptions.length === 0 ? (_jsx("p", { style: { color: '#6b7280', fontSize: 13 }, children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0633\u0627\u0628\u0642\u0629 \u062D\u062A\u0649 \u0627\u0644\u0622\u0646." })) : (_jsx("div", { className: "table-wrap", children: _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0637\u0644\u0628" }), _jsx("th", { children: "\u0627\u0644\u0645\u0628\u0644\u063A" }), _jsx("th", { children: "\u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0629" }), _jsx("th", { children: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u062F\u0641\u0639" }), _jsx("th", { children: "\u0627\u0644\u0645\u0631\u062C\u0639" }), _jsx("th", { children: "\u0627\u0644\u062D\u0627\u0644\u0629" })] }) }), _jsx("tbody", { children: subscriptions.map((sub) => {
                                        const status = STATUS_LABELS[sub.status] ?? { ar: sub.status, ok: false };
                                        return (_jsxs("tr", { children: [_jsx("td", { children: new Date(sub.createdAt).toLocaleDateString('ar-EG') }), _jsx("td", { children: money(Number(sub.amount)) }), _jsxs("td", { style: { fontSize: 12 }, children: [new Date(sub.periodStart).toLocaleDateString('ar-EG'), " \u2014 ", new Date(sub.periodEnd).toLocaleDateString('ar-EG')] }), _jsx("td", { children: sub.paymentMethod === 'VODAFONE_CASH' ? 'فودافون كاش' : sub.paymentMethod === 'INSTAPAY' ? 'إنستاباي' : 'كاش' }), _jsx("td", { children: _jsx("code", { style: { fontSize: 11 }, dir: "ltr", children: sub.paymentReference }) }), _jsx("td", { children: _jsx("span", { className: `badge ${status.ok ? 'badge--ok' : 'badge--warn'}`, children: status.ar }) })] }, sub.id));
                                    }) })] }) }))] }), showPaymentModal && (_jsx("div", { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 100, padding: 16 }, children: _jsxs("div", { className: "card", style: { maxWidth: 460, width: '100%', padding: 24, maxHeight: 'min(88vh, 680px)', overflowY: 'auto' }, children: [_jsxs("h3", { style: { fontSize: 20, fontWeight: 800, marginBottom: 6 }, children: ["\u062A\u0623\u0643\u064A\u062F \u0627\u0644\u062F\u0641\u0639 \u0644\u0627\u0634\u062A\u0631\u0627\u0643 ", MADAR_OFFER.nameAr] }), _jsxs("p", { style: { fontSize: 13, color: '#6b7280', marginBottom: 18 }, children: ["\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0637\u0644\u0648\u0628: ", _jsxs("b", { children: [money(MONTHLY_PRICE_EGP), " / \u0634\u0647\u0631"] })] }), _jsxs("div", { style: { display: 'grid', gap: 14 }, children: [_jsxs("div", { style: { background: '#f0faf5', border: '1px solid #c9e8db', borderRadius: 14, padding: 16, display: 'grid', gap: 12 }, children: [_jsx(InstapayQr, {}), instapayLink && (_jsxs("a", { href: instapayLink, target: "_blank", rel: "noopener noreferrer", className: "btn btn--primary", style: { justifyContent: 'center', width: '100%', paddingBlock: 11 }, children: ["\u0627\u062F\u0641\u0639 \u0627\u0644\u0622\u0646 \u0639\u0628\u0631 \u0631\u0627\u0628\u0637 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A ", _jsx(ExternalLink, { className: "h-4 w-4" })] })), _jsxs("div", { style: { fontSize: 13, textAlign: 'center' }, children: [_jsx("span", { style: { color: '#6b7280' }, children: "\u0623\u0648 \u062D\u0648\u0651\u0644 \u0625\u0644\u0649 \u0627\u0644\u062D\u0633\u0627\u0628:" }), ' ', _jsx("b", { dir: "ltr", style: { color: '#0e7c56' }, children: instapayAccount.accountNumber })] })] }), _jsxs("label", { className: "field", children: [_jsx("span", { className: "field-label", children: "\u0627\u0633\u0645 \u062D\u0633\u0627\u0628\u0643 \u0641\u064A \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A (\u0627\u0644\u0630\u064A \u062F\u0641\u0639\u062A \u0645\u0646\u0647) \u2014 \u0625\u062B\u0628\u0627\u062A \u0627\u0644\u062F\u0641\u0639 *" }), _jsx("input", { className: "input", dir: "ltr", style: { textAlign: 'start' }, placeholder: "name@instapay", value: paymentReference, onChange: (e) => setPaymentReference(e.target.value) }), _jsx("small", { style: { fontSize: 11, color: '#6b7280', marginTop: 4, display: 'block' }, children: "\u0623\u062F\u062E\u0644 \u0627\u0633\u0645 \u062D\u0633\u0627\u0628 \u0625\u0646\u0633\u062A\u0627\u0628\u0627\u064A \u0627\u0644\u0630\u064A \u062F\u0641\u0639\u062A \u0645\u0646\u0647 \u0628\u0627\u0644\u0636\u0628\u0637 \u2014 \u0645\u062B\u0644: name@instapay" })] }), _jsx("p", { style: { fontSize: 12, color: '#6b7280', margin: 0 }, children: "\u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0644\u0627 \u064A\u064F\u0641\u0639\u064E\u0651\u0644 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B. \u062A\u064F\u0631\u0627\u062C\u0639 \u0643\u0644 \u062F\u0641\u0639\u0629 \u064A\u062F\u0648\u064A\u0627\u064B \u0642\u0628\u0644 \u0623\u0646 \u064A\u0628\u062F\u0623 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639." }), _jsxs("div", { style: { display: 'flex', gap: 10, marginTop: 14 }, children: [_jsx("button", { type: "button", className: "btn btn--secondary", style: { flex: 1 }, onClick: () => setShowPaymentModal(false), disabled: isRenewing, children: "\u0625\u0644\u063A\u0627\u0621" }), _jsx("button", { type: "button", className: "btn btn--primary", style: { flex: 2 }, onClick: handleRenewSubmit, disabled: isRenewing, children: isRenewing ? 'جاري الإرسال...' : 'تأكيد الدفع' })] })] })] }) }))] }));
}
