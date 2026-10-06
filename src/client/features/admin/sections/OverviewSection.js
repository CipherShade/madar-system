import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity, Building2, CalendarClock, CheckCircle2, ClipboardList, Clock, CreditCard, Eye, FileWarning, LifeBuoy, Receipt, TrendingUp, UserCog, Users, Wallet, } from 'lucide-react';
import { Metric, Pill } from '../../../components/ui/kit';
import { api, money } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable, EmptyBlock } from './primitives';
import { formatDate, formatNumber } from './format';
export function OverviewSection({ onNavigate }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            setData(await api('/admin/console-stats'));
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
    const quickActions = [
        { id: 'centers', labelKey: 'superAdmin.overview.actionCenters', icon: Building2 },
        { id: 'users', labelKey: 'superAdmin.overview.actionUsers', icon: UserCog },
        { id: 'subscriptions', labelKey: 'superAdmin.overview.actionSubscriptions', icon: Receipt },
        { id: 'revenue', labelKey: 'superAdmin.overview.actionRevenue', icon: CreditCard },
        { id: 'usage', labelKey: 'superAdmin.overview.actionUsage', icon: Activity },
        { id: 'support', labelKey: 'superAdmin.overview.actionSupport', icon: LifeBuoy },
        { id: 'health', labelKey: 'superAdmin.overview.actionHealth', icon: FileWarning },
        { id: 'audit', labelKey: 'superAdmin.overview.actionAudit', icon: ClipboardList },
    ];
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.overview.title", subtitleKey: "superAdmin.overview.subtitle", onRefresh: () => void load() }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !data ? (_jsx(ErrorBlock, { labelKey: "superAdmin.overview.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "metrics-grid", style: { marginBottom: 20 }, children: [_jsx(Metric, { label: t('superAdmin.overview.mrr'), value: money(data.mrrEgp), icon: TrendingUp, hint: t('superAdmin.overview.mrrHint') }), _jsx(Metric, { label: t('superAdmin.overview.revenueThisMonth'), value: money(data.revenueThisMonth), icon: Wallet }), _jsx(Metric, { label: t('superAdmin.overview.monthlyVisits'), value: formatNumber(data.monthlyVisits), icon: Activity }), _jsx(Metric, { label: t('superAdmin.overview.activeCenters'), value: formatNumber(data.tenants.active), icon: CheckCircle2, hint: `${t('superAdmin.overview.ofTotal', { total: formatNumber(data.tenants.total) })}` }), _jsx(Metric, { label: t('superAdmin.overview.trialCenters'), value: formatNumber(data.tenants.trial), icon: Clock }), _jsx(Metric, { label: t('superAdmin.overview.suspendedCenters'), value: formatNumber(data.tenants.suspended), icon: FileWarning }), _jsx(Metric, { label: t('superAdmin.overview.newThisMonth'), value: formatNumber(data.tenants.newThisMonth), icon: CalendarClock }), _jsx(Metric, { label: t('superAdmin.overview.totalUsers'), value: formatNumber(data.users.total), icon: Users, hint: t('superAdmin.overview.inactiveUsers', { count: data.users.inactive }) }), _jsx(Metric, { label: t('superAdmin.overview.pastDue'), value: formatNumber(data.billing.pastDue), icon: Receipt }), _jsx(Metric, { label: t('superAdmin.overview.stalePending'), value: formatNumber(data.billing.stalePending), icon: CalendarClock }), _jsx(Metric, { label: t('superAdmin.overview.openNotes'), value: formatNumber(data.support.openNotes), icon: LifeBuoy }), _jsx(Metric, { label: t('superAdmin.overview.pendingNotifications'), value: formatNumber(data.notifications.total), icon: Wallet }), _jsx(Metric, { label: t('superAdmin.overview.openViewAsSessions'), value: formatNumber(data.viewAs.openSessions), icon: Eye })] }), onNavigate && (_jsxs("div", { style: { marginBottom: 24 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.overview.quickActions') }), _jsx("div", { style: { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }, children: quickActions.map((action) => {
                                    const Icon = action.icon;
                                    return (_jsxs("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '10px 12px', gap: 6, justifyContent: 'flex-start' }, onClick: () => onNavigate(action.id), "aria-label": t(action.labelKey), children: [_jsx(Icon, { className: "h-3 w-3" }), t(action.labelKey)] }, action.id));
                                }) })] })), data.approachingLimits.length > 0 && (_jsxs("div", { style: { marginBottom: 24 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.overview.approachingLimits') }), _jsx("div", { style: { display: 'grid', gap: 8 }, children: data.approachingLimits.map((center) => (_jsxs("div", { className: "table-wrapper", style: { padding: '10px 14px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }, children: [_jsx("strong", { style: { fontSize: 13 }, children: center.centerName }), _jsxs("span", { className: "page-sub", style: { fontSize: 12 }, children: [t('superAdmin.usage.metric.VISITS'), ": ", formatNumber(center.visitsThisPeriod)] }), onNavigate && (_jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '3px 10px', marginInlineStart: 'auto' }, onClick: () => onNavigate('centers'), "aria-label": t('superAdmin.overview.inspectCenter', { name: center.centerName }), children: t('superAdmin.overview.inspect') }))] }, center.tenantId))) })] })), data.support.recentNotes.length > 0 && (_jsxs("div", { style: { marginBottom: 24 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.overview.recentNotes') }), _jsx(SectionTable, { labelKey: "superAdmin.overview.recentNotes", headers: ['superAdmin.support.col.center', 'superAdmin.common.status', 'superAdmin.common.time'], colSpan: 3, emptyKey: "superAdmin.overview.notesEmpty", children: data.support.recentNotes.map((note) => (_jsxs("tr", { children: [_jsx("td", { style: { fontSize: 13 }, children: note.tenant?.name ?? '—' }), _jsx("td", { children: _jsx(Pill, { tone: note.status === 'RESOLVED' ? 'success' : note.status === 'OPEN' ? 'warning' : 'muted', children: t(`superAdmin.support.short.${note.status}`, note.status) }) }), _jsx("td", { style: { fontSize: 12 }, children: formatDate(note.createdAt) })] }, note.id))) })] })), data.recentActivity.length > 0 && (_jsxs("div", { style: { marginBottom: 24 }, children: [_jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.overview.recentActivity') }), _jsx(SectionTable, { labelKey: "superAdmin.overview.recentActivity", headers: ['superAdmin.common.action', 'superAdmin.centers.col.center', 'superAdmin.common.time'], colSpan: 3, emptyKey: "superAdmin.overview.activityEmpty", children: data.recentActivity.map((entry) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx("code", { style: { fontSize: 12 }, children: entry.action }) }), _jsx("td", { style: { fontSize: 13 }, children: entry.tenant?.name ?? '—' }), _jsx("td", { style: { fontSize: 12 }, children: formatDate(entry.createdAt) })] }, entry.id))) })] })), _jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 10 }, children: t('superAdmin.overview.health') }), data.recentHealthEvents.length === 0 ? (_jsx(EmptyBlock, { labelKey: "superAdmin.overview.healthEmpty" })) : (_jsx(SectionTable, { labelKey: "superAdmin.overview.health", headers: ['superAdmin.common.level', 'superAdmin.common.category', 'superAdmin.common.time'], colSpan: 3, emptyKey: "superAdmin.overview.healthEmpty", children: data.recentHealthEvents.map((event) => (_jsxs("tr", { children: [_jsx("td", { children: _jsx(Pill, { tone: event.level === 'CRITICAL' ? 'danger' : event.level === 'WARNING' ? 'warning' : 'muted', children: t(`superAdmin.common.level.${event.level}`, event.level) }) }), _jsx("td", { style: { fontSize: 13 }, children: event.category }), _jsx("td", { style: { fontSize: 12 }, children: formatDate(event.createdAt) })] }, event.id))) }))] }))] }));
}
