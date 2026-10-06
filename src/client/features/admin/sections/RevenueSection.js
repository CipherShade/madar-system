import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, TrendingUp, Undo2 } from 'lucide-react';
import { Metric } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { EmptyBlock, ErrorBlock, LoadingBlock, SectionHeader, SectionTable } from './primitives';
import { formatNumber } from './format';
function monthLabel(key, locale) {
    const [year, month] = key.split('-').map((part) => Number.parseInt(part, 10));
    if (!Number.isFinite(year) || !Number.isFinite(month))
        return key;
    return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' }).format(new Date(Date.UTC(year, month - 1, 1)));
}
export function RevenueSection() {
    const { t, i18n } = useTranslation();
    const locale = i18n.language === 'en' ? 'en-EG' : 'ar-EG';
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            setData(await api('/admin/revenue?months=6'));
        }
        catch {
            setFailed(true);
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        void load();
    }, []);
    const maxHistory = data ? Math.max(1, ...data.history.map((point) => point.amount)) : 1;
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.revenue.title", subtitleKey: "superAdmin.revenue.subtitle", onRefresh: () => void load() }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !data ? (_jsx(ErrorBlock, { labelKey: "superAdmin.revenue.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "metrics-grid", style: { marginBottom: 24 }, children: [_jsx(Metric, { label: t('superAdmin.revenue.mrr'), value: money(data.mrr, locale), icon: TrendingUp }), _jsx(Metric, { label: t('superAdmin.revenue.thisMonth'), value: money(data.revenueThisMonth, locale), icon: TrendingUp }), _jsx(Metric, { label: t('superAdmin.revenue.atRisk'), value: money(data.atRiskRevenue, locale), icon: AlertTriangle }), _jsx(Metric, { label: t('superAdmin.revenue.pastDue'), value: formatNumber(data.movements.pastDue), icon: AlertTriangle }), _jsx(Metric, { label: t('superAdmin.revenue.stalePending', { days: data.stalePendingAfterDays }), value: formatNumber(data.movements.stalePending), icon: AlertTriangle }), _jsx(Metric, { label: t('superAdmin.revenue.refunds'), value: money(data.adjustments.refunds, locale), icon: Undo2 })] }), _jsx("div", { style: { display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }, children: _jsxs("div", { children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 12 }, children: t('superAdmin.revenue.history') }), data.history.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.revenue.historyEmpty" })) : (_jsx("div", { style: { display: 'grid', gap: 8 }, children: data.history.map((point) => (_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }, children: [_jsx("span", { style: { minWidth: 92, color: 'var(--color-muted, #64748b)' }, children: monthLabel(point.key, locale) }), _jsx("span", { style: {
                                                    flex: 1,
                                                    height: 10,
                                                    borderRadius: 6,
                                                    background: 'var(--border-color, rgba(0,0,0,0.08))',
                                                    overflow: 'hidden',
                                                }, children: _jsx("span", { style: {
                                                        display: 'block',
                                                        height: '100%',
                                                        width: `${Math.round((point.amount / maxHistory) * 100)}%`,
                                                        background: 'var(--color-primary, #0f766e)',
                                                    } }) }), _jsxs("span", { style: { minWidth: 110, textAlign: 'end' }, children: [_jsx("strong", { children: money(point.amount, locale) }), _jsx("br", {}), _jsx("span", { className: "page-sub", style: { fontSize: 11 }, children: t('superAdmin.revenue.subscriptionsCount', { count: point.count }) })] })] }, point.key))) }))] }) }), _jsxs("div", { style: { marginTop: 24 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 12 }, children: t('superAdmin.revenue.movements') }), _jsxs(SectionTable, { labelKey: "superAdmin.revenue.movements", headers: ['superAdmin.revenue.col.movement', 'superAdmin.revenue.col.value'], colSpan: 2, children: [_jsxs("tr", { children: [_jsx("td", { children: t('superAdmin.revenue.newSubscriptions') }), _jsx("td", { children: formatNumber(data.movements.newSubscriptions) })] }), _jsxs("tr", { children: [_jsx("td", { children: t('superAdmin.revenue.canceledSubscriptions') }), _jsx("td", { children: formatNumber(data.movements.canceledSubscriptions) })] }), _jsxs("tr", { children: [_jsx("td", { children: t('superAdmin.revenue.discounts') }), _jsx("td", { children: money(data.adjustments.discounts, locale) })] }), _jsxs("tr", { children: [_jsx("td", { children: t('superAdmin.revenue.credits') }), _jsx("td", { children: money(data.adjustments.credits, locale) })] })] })] })] }))] }));
}
