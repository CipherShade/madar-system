import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';
import { Metric, Pill, notify } from '../../../components/ui/kit';
import { api } from '../../../lib/api';
import { SectionHeader, LoadingBlock, ErrorBlock, SectionTable } from './primitives';
import { formatDateTime, formatLatency } from './format';
export function HealthSection() {
    const { t } = useTranslation();
    const [checks, setChecks] = useState(null);
    const [events, setEvents] = useState([]);
    const [unresolved, setUnresolved] = useState(0);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const load = async () => {
        setLoading(true);
        setFailed(false);
        try {
            const [checkData, eventData] = await Promise.all([
                api('/admin/system-health/checks'),
                api('/admin/system-health/events?limit=100'),
            ]);
            setChecks(checkData);
            setEvents(eventData.events);
            setUnresolved(eventData.pagination.unresolved);
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
    const runAndRecord = async () => {
        try {
            const data = await api('/admin/system-health/checks', { method: 'POST' });
            notify(data.recordedEvents > 0
                ? t('superAdmin.health.recorded', { count: data.recordedEvents })
                : t('superAdmin.health.allHealthy'), data.recordedEvents > 0 ? 'error' : 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.health.runError'), 'error');
        }
    };
    const resolve = async (event) => {
        setBusyId(event.id);
        try {
            await api(`/admin/system-health/events/${event.id}/resolve`, { method: 'POST' });
            notify(t('superAdmin.health.resolved'), 'success');
            void load();
        }
        catch {
            notify(t('superAdmin.health.resolveError'), 'error');
        }
        finally {
            setBusyId(null);
        }
    };
    return (_jsxs("div", { children: [_jsx(SectionHeader, { titleKey: "superAdmin.health.title", subtitleKey: "superAdmin.health.subtitle", onRefresh: () => void load(), actions: _jsxs("button", { className: "btn btn--primary", style: { fontSize: 12 }, onClick: () => void runAndRecord(), children: [_jsx(RefreshCw, { className: "h-4 w-4" }), t('superAdmin.health.runChecks')] }) }), loading ? (_jsx(LoadingBlock, { labelKey: "superAdmin.common.loading" })) : failed || !checks ? (_jsx(ErrorBlock, { labelKey: "superAdmin.health.loadError", onRetry: () => void load() })) : (_jsxs(_Fragment, { children: [_jsxs("div", { className: "metrics-grid", style: { marginBottom: 24 }, children: [_jsx(Metric, { label: t('superAdmin.health.totalChecks'), value: String(checks.summary.total), icon: RefreshCw }), _jsx(Metric, { label: t('superAdmin.health.okChecks'), value: String(checks.summary.ok), icon: CheckCircle2 }), _jsx(Metric, { label: t('superAdmin.health.failedChecks'), value: String(checks.summary.failed), icon: XCircle }), _jsx(Metric, { label: t('superAdmin.health.unresolved'), value: String(unresolved), icon: XCircle })] }), _jsx("h3", { className: "page-title", style: { fontSize: 15, marginBottom: 12 }, children: t('superAdmin.health.liveChecks') }), _jsx(SectionTable, { labelKey: "superAdmin.health.liveChecks", headers: [
                            'superAdmin.health.col.check',
                            'superAdmin.health.col.state',
                            'superAdmin.health.col.latency',
                            'superAdmin.health.col.detail',
                        ], colSpan: 4, children: checks.checks.map((check) => (_jsxs("tr", { children: [_jsx("td", { children: check.labelAr }), _jsx("td", { children: _jsx(Pill, { tone: check.ok ? 'success' : check.level === 'CRITICAL' ? 'danger' : 'warning', children: t(check.ok ? 'superAdmin.common.healthy' : `superAdmin.common.level.${check.level}`, check.ok ? 'OK' : check.level) }) }), _jsx("td", { style: { fontSize: 12 }, children: formatLatency(check.latencyMs) }), _jsx("td", { style: { fontSize: 13 }, children: check.detailAr })] }, check.key))) }), _jsx("h3", { className: "page-title", style: { fontSize: 15, margin: '24px 0 12px' }, children: t('superAdmin.health.eventLog') }), _jsx(SectionTable, { labelKey: "superAdmin.health.eventLog", headers: [
                            'superAdmin.common.level',
                            'superAdmin.common.category',
                            'superAdmin.health.col.message',
                            'superAdmin.common.time',
                            'superAdmin.common.actions',
                        ], colSpan: 5, emptyKey: "superAdmin.overview.healthEmpty", children: events.length === 0 ? undefined : (events.map((event) => (_jsxs("tr", { style: { opacity: event.resolvedAt ? 0.55 : 1 }, children: [_jsx("td", { children: _jsx(Pill, { tone: event.level === 'CRITICAL' ? 'danger' : event.level === 'WARNING' ? 'warning' : 'muted', children: t(`superAdmin.common.level.${event.level}`, event.level) }) }), _jsx("td", { style: { fontSize: 12 }, children: event.category }), _jsx("td", { style: { fontSize: 13 }, children: event.message }), _jsx("td", { style: { fontSize: 12 }, children: formatDateTime(event.createdAt) }), _jsx("td", { children: event.resolvedAt ? (_jsx("span", { className: "page-sub", style: { fontSize: 12 }, children: t('superAdmin.health.resolvedAt', { date: formatDateTime(event.resolvedAt) }) })) : (_jsx("button", { className: "btn btn--ghost", style: { fontSize: 12, padding: '4px 10px' }, onClick: () => void resolve(event), disabled: busyId === event.id, children: t('superAdmin.health.resolve') })) })] }, event.id)))) })] }))] }));
}
