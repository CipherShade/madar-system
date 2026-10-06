import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, BarChart3, Building2, UserCheck, Users } from 'lucide-react';
export function UsageMeter({ usage, loading, onNavigateToBilling }) {
    const { t, i18n } = useTranslation();
    const isArabic = i18n.language === 'ar';
    const locale = isArabic ? 'ar-EG' : 'en-US';
    if (loading) {
        return (_jsx("div", { className: "card card-pad", style: { marginBottom: 24, opacity: 0.7 }, children: _jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 8 }, children: [_jsx(BarChart3, { className: "h-4 w-4 animate-pulse text-emerald-600" }), _jsxs("span", { style: { fontSize: 13, color: 'var(--muted)' }, children: [t('usage.title'), "..."] })] }) }));
    }
    if (!usage)
        return null;
    // Counts are display-only, so normalise anything missing rather than letting
    // a malformed payload throw inside toLocaleString() during render.
    if (typeof usage.usedVisits !== 'number')
        return null;
    const usedVisits = usage.usedVisits;
    const branchUsage = usage.branchUsage ?? [];
    const periodStart = new Date(usage.periodStart);
    const periodEnd = new Date(usage.periodEnd);
    return (_jsxs("div", { className: "card card-pad", style: { background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', marginBottom: 24 }, children: [_jsxs("div", { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10 }, children: [_jsx("div", { style: {
                                    width: 36,
                                    height: 36,
                                    borderRadius: 10,
                                    background: 'rgba(14, 124, 86, 0.1)',
                                    color: 'var(--primary, #0e7c56)',
                                    display: 'grid',
                                    placeItems: 'center',
                                }, children: _jsx(BarChart3, { className: "h-4 w-4" }) }), _jsxs("div", { children: [_jsx("h3", { style: { fontSize: 16, fontWeight: 800, margin: 0 }, children: t('usage.title') }), _jsx("p", { style: { fontSize: 12, color: 'var(--muted, #6b7280)', margin: 0 }, children: t('usage.unlimitedSubtitle') })] })] }), _jsxs("button", { type: "button", className: "btn btn--soft btn--sm", onClick: onNavigateToBilling, style: { fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [t('common.billing'), _jsx(ArrowUpRight, { className: "h-3.5 w-3.5" })] })] }), _jsxs("div", { style: {
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 16,
                    padding: '14px 16px',
                    background: '#f9fafb',
                    borderRadius: 12,
                }, children: [_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(Users, { className: "h-3.5 w-3.5" }), _jsx("span", { children: t('usage.monthlyVisitsLabel') })] }), _jsx("div", { style: { fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }, children: usedVisits.toLocaleString(locale) }), _jsx("div", { style: { fontSize: 11, color: '#6b7280', marginTop: 2 }, children: t('usage.unlimitedNote') })] }), branchUsage.map((branch) => (_jsxs("div", { children: [_jsxs("div", { style: { fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(Building2, { className: "h-3.5 w-3.5" }), _jsx("span", { children: branch.branchName })] }), _jsx("div", { style: { fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }, children: branch.visitCount.toLocaleString(locale) })] }, branch.branchId ?? branch.branchName))), _jsxs("div", { children: [_jsxs("div", { style: { fontSize: 12, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6 }, children: [_jsx(UserCheck, { className: "h-3.5 w-3.5" }), _jsx("span", { children: t('usage.receptionistsLabel') })] }), _jsx("div", { style: { fontSize: 18, fontWeight: 800, color: '#111827', marginTop: 4 }, children: isArabic ? 'غير محدود' : 'Unlimited' })] })] }), _jsxs("div", { style: { fontSize: 11, color: '#6b7280', marginTop: 10 }, children: [periodStart.toLocaleDateString(locale), " \u2014 ", periodEnd.toLocaleDateString(locale)] })] }));
}
